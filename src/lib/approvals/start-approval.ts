import type { SupabaseClient } from "@supabase/supabase-js";
import { createApprovalRequest, type ApprovalStepInput } from "./create-approval-request";
import { resolveApprover, resolveUsersByRole, ApproverResolutionError } from "./resolve-approver";
import { evaluateCondition, type ConditionRule } from "./evaluate-condition";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// Universal Approval Engine — definition-driven submission (Area 02 spec
// §6/§19.A-C). This is the dynamic counterpart to createApprovalRequest:
// instead of a caller hand-building a steps array, it looks up the active
// approval_definitions row for (orgId, resource), evaluates each step's
// condition against the caller's metadata, resolves approvers dynamically,
// and defers the actual request/step/action inserts to createApprovalRequest
// — one set of tables, two ways to populate them, not a second approval
// system (spec constraint #2).
export async function startApproval(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    resource: string; // matches approval_definitions.resource
    entityType: string;
    entityId: string;
    requesterId: string; // app_users.id, derived server-side by the caller
    subjectEmployeeId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
    deepLinkBase?: string; // e.g. "/dashboard/approvals" — for the notification's deep_link
  }
): Promise<{ requestId: string; status: "pending_approval" | "approved" }> {
  const { data: definition, error: defErr } = await supabase
    .from("approval_definitions")
    .select("id, version, code, name")
    .eq("org_id", input.orgId)
    .eq("resource", input.resource)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (defErr) throw new Error(defErr.message);
  if (!definition) {
    throw new Error(`No active approval definition is configured for "${input.resource}" in this organisation.`);
  }

  const { data: defSteps, error: stepsErr } = await supabase
    .from("approval_definition_steps")
    .select("id, step_order, name, approver_type, approver_value, sla_hours, condition_json")
    .eq("definition_id", definition.id)
    .order("step_order", { ascending: true });
  if (stepsErr) throw new Error(stepsErr.message);
  if (!defSteps || defSteps.length === 0) {
    throw new Error(`Approval definition "${definition.code}" has no steps configured.`);
  }

  const metadata = input.metadata ?? {};
  const steps: ApprovalStepInput[] = [];
  // { stepIndex, kind: "role", role } entries get fanned out to once the
  // request exists and we know its id for the deep link.
  const roleNotifications: { role: string; stepOrder: number }[] = [];
  const userNotifications: { userId: string; stepOrder: number }[] = [];

  for (const step of defSteps) {
    const matches = evaluateCondition(step.condition_json as ConditionRule, metadata);
    if (!matches) continue; // condition didn't match — this step is skipped entirely

    let resolved;
    try {
      resolved = await resolveApprover(supabase, {
        requesterId: input.requesterId,
        approverType: step.approver_type as Parameters<typeof resolveApprover>[1]["approverType"],
        approverValue: step.approver_value,
        orgId: input.orgId,
      });
    } catch (e) {
      if (e instanceof ApproverResolutionError) {
        throw new Error(`Step "${step.name}": ${e.message}`);
      }
      throw e;
    }

    if (resolved.kind === "auto") continue; // auto-pass steps need no human decision at all

    const dueAt = step.sla_hours ? new Date(Date.now() + step.sla_hours * 3600_000).toISOString() : null;
    const stepOrder = steps.length + 1;
    if (resolved.kind === "user") {
      steps.push({ approverUserId: resolved.userId, definitionStepId: step.id, dueAt });
      userNotifications.push({ userId: resolved.userId, stepOrder });
    } else {
      steps.push({ approverRole: resolved.role, definitionStepId: step.id, dueAt });
      roleNotifications.push({ role: resolved.role, stepOrder });
    }
  }

  // Every configured step either didn't match its condition or auto-passed
  // — nothing left for a human to decide, so the request is approved on
  // arrival rather than stuck forever with zero steps.
  if (steps.length === 0) {
    const requestId = await createApprovalRequest(supabase, {
      orgId: input.orgId,
      requestType: input.resource,
      entityType: input.entityType,
      entityId: input.entityId,
      requestedBy: input.requesterId,
      subjectEmployeeId: input.subjectEmployeeId ?? null,
      summary: input.summary,
      impact: metadata,
      steps: [],
      definitionId: definition.id,
      definitionVersion: definition.version,
    });
    await supabase.from("approval_requests").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", requestId);
    await recordAuditEvent(supabase, {
      orgId: input.orgId,
      actorUserId: input.requesterId,
      action: "approval.auto_approved",
      resourceType: "approval_request",
      resourceId: requestId,
      eventCategory: "approval",
      after: { status: "approved", reason: "no steps required approval" },
    });
    return { requestId, status: "approved" };
  }

  const requestId = await createApprovalRequest(supabase, {
    orgId: input.orgId,
    requestType: input.resource,
    entityType: input.entityType,
    entityId: input.entityId,
    requestedBy: input.requesterId,
    subjectEmployeeId: input.subjectEmployeeId ?? null,
    summary: input.summary,
    impact: metadata,
    steps,
    definitionId: definition.id,
    definitionVersion: definition.version,
  });

  const deepLink = `${input.deepLinkBase ?? "/dashboard/approvals"}`;
  // Only the first (now-active) step's assignees are notified at
  // submission — later steps are notified when the request reaches them
  // (decideApprovalStep's job, not this one).
  const firstUser = userNotifications.find((n) => n.stepOrder === 1);
  const firstRole = roleNotifications.find((n) => n.stepOrder === 1);
  if (firstUser) {
    await createNotification(supabase, {
      orgId: input.orgId,
      recipientUserId: firstUser.userId,
      type: "approval.step_assigned",
      category: "approval",
      priority: "action_required",
      title: "Approval needed",
      message: input.summary,
      entityType: "approval_request",
      entityId: requestId,
      actionUrl: deepLink,
    });
  } else if (firstRole) {
    const recipients = await resolveUsersByRole(supabase, input.orgId, firstRole.role);
    await createNotificationForMany(supabase, recipients, {
      orgId: input.orgId,
      type: "approval.step_assigned",
      category: "approval",
      priority: "action_required",
      title: "Approval needed",
      message: input.summary,
      entityType: "approval_request",
      entityId: requestId,
      actionUrl: deepLink,
    });
  }

  await recordAuditEvent(supabase, {
    orgId: input.orgId,
    actorUserId: input.requesterId,
    action: "approval.submitted",
    resourceType: "approval_request",
    resourceId: requestId,
    eventCategory: "approval",
    after: { definition: definition.code, resource: input.resource, steps: steps.length },
  });

  return { requestId, status: "pending_approval" };
}
