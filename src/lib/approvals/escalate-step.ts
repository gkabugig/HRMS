import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { resolveUsersByRole } from "./resolve-approver";

// Universal Approval Engine — SLA escalation (Area 02 spec §13/§19.G).
// Reassigns an overdue, still-pending step to the next person up the chain
// and logs the handoff in approval_escalations, so an approver who goes
// quiet doesn't block the request forever. This is the "foundation" slice
// of escalation the user scoped in: a single, predictable escalation rule
// (named approver → their own manager; role-assigned step → the next role
// up), not a per-definition configurable escalation policy — that's a
// reasonable later addition once a real escalation-target column shows up
// on approval_definition_steps.
//
// Two callers: a manual "Escalate" button (admin/hr, normal session —
// covered by the existing approval_steps_hr_full RLS policy), and the
// scheduled /api/cron/approval-escalations route (no user session, so it
// runs this against a service-role client that bypasses RLS entirely).
export class EscalationError extends Error {}

export async function escalateStep(
  supabase: SupabaseClient,
  input: { stepId: string; orgId: string; reason?: string | null; actorUserId?: string | null }
): Promise<{ toUserId: string | null; toRole: string | null }> {
  const { data: step, error: stepErr } = await supabase
    .from("approval_steps")
    .select("id, approval_request_id, status, approver_user_id, approver_role, definition_step_id")
    .eq("id", input.stepId)
    .single();
  if (stepErr || !step) throw new EscalationError("Approval step not found.");
  if (step.status !== "pending") throw new EscalationError("This step has already been decided.");

  const { data: request, error: reqErr } = await supabase
    .from("approval_requests")
    .select("id, org_id, status, summary")
    .eq("id", step.approval_request_id)
    .single();
  if (reqErr || !request) throw new EscalationError("Approval request not found.");
  if (request.org_id !== input.orgId) throw new EscalationError("Approval request not found.");
  if (request.status !== "pending_approval") throw new EscalationError("This request is no longer awaiting a decision.");

  if (step.definition_step_id) {
    const { data: defStep } = await supabase
      .from("approval_definition_steps")
      .select("allow_escalation")
      .eq("id", step.definition_step_id)
      .maybeSingle();
    if (defStep && defStep.allow_escalation === false) {
      throw new EscalationError("This step's definition doesn't allow escalation.");
    }
  }

  const fromApproverId = step.approver_user_id ?? null;
  let toUserId: string | null = null;
  let toRole: string | null = null;

  if (fromApproverId) {
    // Named approver — escalate one level up their own reporting line. No
    // manager on file (or they report to no one) falls back to HR, since
    // that's always a safe, populated landing spot in this schema.
    const { data: approverAppUser } = await supabase
      .from("app_users")
      .select("employee_id")
      .eq("id", fromApproverId)
      .maybeSingle();
    if (approverAppUser?.employee_id) {
      const { data: approverEmployee } = await supabase
        .from("employees")
        .select("reporting_manager_id")
        .eq("id", approverAppUser.employee_id)
        .maybeSingle();
      if (approverEmployee?.reporting_manager_id) {
        const { data: nextManagerUser } = await supabase
          .from("app_users")
          .select("id")
          .eq("employee_id", approverEmployee.reporting_manager_id)
          .maybeSingle();
        if (nextManagerUser?.id && nextManagerUser.id !== fromApproverId) {
          toUserId = nextManagerUser.id as string;
        }
      }
    }
    if (!toUserId) toRole = "hr";
  } else if (step.approver_role) {
    // Role-assigned step — "admin" is the top of this schema's role
    // ladder, so any other role (hr, or a SPECIFIC_ROLE like manager)
    // escalates up to admin; a step already assigned to admin has nowhere
    // higher to go, so it stays with admin but is still logged and
    // re-notified.
    toRole = "admin";
  } else {
    throw new EscalationError("This step has no approver to escalate from.");
  }

  const { error: updateErr } = await supabase
    .from("approval_steps")
    .update({
      ...(toUserId ? { approver_user_id: toUserId, approver_role: null } : { approver_role: toRole, approver_user_id: null }),
      started_at: new Date().toISOString(),
    })
    .eq("id", step.id);
  if (updateErr) throw new Error(updateErr.message);

  const { error: escErr } = await supabase.from("approval_escalations").insert({
    request_id: request.id,
    step_id: step.id,
    from_approver_id: fromApproverId,
    to_approver_id: toUserId,
    reason: input.reason ?? "SLA overdue",
  });
  if (escErr) throw new Error(escErr.message);

  if (toUserId) {
    await createNotification(supabase, {
      orgId: request.org_id,
      recipientUserId: toUserId,
      type: "approval.escalated",
      category: "approval",
      priority: "action_required",
      title: "Escalated approval needs your decision",
      message: request.summary,
      entityType: "approval_request",
      entityId: request.id,
      actionUrl: "/dashboard/approvals",
    });
  } else if (toRole) {
    const recipients = await resolveUsersByRole(supabase, request.org_id, toRole);
    await createNotificationForMany(supabase, recipients, {
      orgId: request.org_id,
      type: "approval.escalated",
      category: "approval",
      priority: "action_required",
      title: "Escalated approval needs a decision",
      message: request.summary,
      entityType: "approval_request",
      entityId: request.id,
      actionUrl: "/dashboard/approvals",
    });
  }

  await recordAuditEvent(supabase, {
    orgId: request.org_id,
    actorUserId: input.actorUserId ?? null,
    action: "approval.escalated",
    resourceType: "approval_request",
    resourceId: request.id,
    eventCategory: "approval",
    after: { stepId: step.id, fromApproverId, toUserId, toRole, reason: input.reason ?? "SLA overdue" },
  });

  return { toUserId, toRole };
}

// Overdue, still-pending steps (due_at in the past) across every org — the
// cron route's worklist (one query, service-role client, no org in
// context), and also useful for an "Overdue" tab in the Approvals Centre.
// Returns each step paired with its request's org_id, since escalateStep
// cross-checks that against the caller's orgId.
export async function findOverdueSteps(supabase: SupabaseClient): Promise<{ stepId: string; orgId: string }[]> {
  const { data, error } = await supabase
    .from("approval_steps")
    .select("id, approval_requests!inner(status, org_id)")
    .eq("status", "pending")
    .eq("approval_requests.status", "pending_approval")
    .lt("due_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((s) => {
      const req = s.approval_requests as unknown as { org_id: string } | { org_id: string }[] | null;
      const orgId = Array.isArray(req) ? req[0]?.org_id : req?.org_id;
      return orgId ? { stepId: s.id as string, orgId } : null;
    })
    .filter((s): s is { stepId: string; orgId: string } => s !== null);
}
