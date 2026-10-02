import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { authorize } from "@/lib/authz/authorize";
import type { RbacAction, RbacResource, RbacSensitivity } from "@/lib/authz/types";
import { isValidDelegate } from "./delegation";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { processEventImmediately } from "@/lib/notifications/scheduler";

// Sequential, single-active-step approval (spec §10.2: steps execute in
// order; the request only becomes fully approved once every step has). No
// parallel-step support in this pass — every request created so far uses a
// single step, so this is the simplest engine that's actually correct for
// what's wired up today, and safe to extend if a multi-step request type
// shows up later.
//
// Hardened for Area 02's security requirements (spec §17): the acting user
// is always re-derived from the live session (never trusted from
// input.actorUserId — a caller can still pass it for logging/backward
// compatibility, but it's checked against, not relied on), self-approval is
// denied outright (no segregation-of-duties exception table exists to opt
// out of this), the request/step must still be actionable, a non-named
// actor must be a valid time-bounded delegate, and the new unique index on
// approval_actions (migration 0039) turns a double-decision race into a
// clean "already decided" error instead of two rows.
export async function decideApprovalStep(
  supabase: SupabaseClient,
  input: {
    stepId: string;
    orgId: string;
    decision: "approved" | "rejected" | "returned";
    comment?: string | null;
    // Optional: when the caller knows which RBAC permission this decision
    // maps to (e.g. employees/edit for Employee Data Change), it's checked
    // before anything else. Omitted for request types that don't have one
    // yet — RLS plus the checks below remain the enforcement floor either way.
    rbac?: { resource: RbacResource; action: RbacAction; sensitivity?: RbacSensitivity; recordId?: string | null };
  }
): Promise<{ requestId: string; requestStatus: string }> {
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();
  if (!sessionUser) throw new Error("Not signed in.");
  // The real acting identity is always the live session, never the caller's
  // argument — matches authorize_request()'s own hardening on the DB side.
  const actorUserId = sessionUser.id;

  if (input.rbac) {
    const decision = await authorize(supabase, input.rbac);
    if (!decision.allowed) throw new Error("You do not have permission to decide this approval.");
  }

  const { data: step, error: stepErr } = await supabase
    .from("approval_steps")
    .select("id, approval_request_id, step_order, status, approver_user_id, approver_role")
    .eq("id", input.stepId)
    .single();
  if (stepErr || !step) throw new Error("Approval step not found.");
  if (step.status !== "pending") {
    throw new Error("This step has already been decided.");
  }

  const { data: request, error: reqErr } = await supabase
    .from("approval_requests")
    .select("id, status, requested_by, request_type")
    .eq("id", step.approval_request_id)
    .single();
  if (reqErr || !request) throw new Error("Approval request not found.");
  if (request.status !== "pending_approval") {
    throw new Error("This request is no longer awaiting a decision.");
  }

  if (request.requested_by === actorUserId) {
    throw new Error("You can't approve your own request.");
  }

  // Is the actor the named approver, assigned by role, or acting as a valid
  // delegate for the named approver? RLS enforces the same boundary
  // independently (approval_steps_approver_decide / _role_decide /
  // _delegate_decide / _hr_full) — this check exists to give a clear error
  // message rather than a bare RLS denial, and to decide whether to stamp
  // delegated_from/delegated_to on the step.
  let delegatedFrom: string | null = null;
  const isNamedApprover = step.approver_user_id === actorUserId;
  if (!isNamedApprover && step.approver_user_id) {
    const validDelegate = await isValidDelegate(supabase, {
      delegatorId: step.approver_user_id,
      delegateId: actorUserId,
      resource: request.request_type,
      orgId: input.orgId,
    });
    if (validDelegate) delegatedFrom = step.approver_user_id;
  }

  // Atomic compare-and-swap: the earlier status==='pending' read above is
  // only an advisory check for a clean error message, not an enforcement
  // boundary - two concurrent decisions can both pass it before either
  // writes. Gating the UPDATE itself on status='pending' makes only the
  // first writer's update actually match a row; the second gets back zero
  // affected rows and is rejected here instead of silently flipping an
  // already-decided step to a second, conflicting status.
  const { data: updatedStep, error: updateErr } = await supabase
    .from("approval_steps")
    .update({
      status: input.decision,
      decided_at: new Date().toISOString(),
      comment: input.comment ?? null,
      ...(delegatedFrom ? { delegated_from: delegatedFrom, delegated_to: actorUserId } : {}),
    })
    .eq("id", step.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateErr) throw new Error(updateErr.message);
  if (!updatedStep) {
    throw new Error("This step was just decided by someone else.");
  }

  const { error: actionErr } = await supabase.from("approval_actions").insert({
    approval_request_id: request.id,
    step_id: step.id,
    actor_user_id: actorUserId,
    action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "return",
    reason: input.comment ?? null,
    from_status: request.status,
    to_status: input.decision === "approved" ? "pending_approval" : input.decision,
  });
  if (actionErr) {
    // uq_approval_actions_decision (migration 0039) — two concurrent
    // requests both passed the step.status==='pending' check above and
    // raced each other to record a decision. Whichever loses gets a clean
    // error instead of a duplicate approval_actions row.
    if (actionErr.code === "23505") {
      throw new Error("This step was just decided by someone else.");
    }
    throw new Error(actionErr.message);
  }

  let requestStatus = request.status;
  if (input.decision === "rejected" || input.decision === "returned") {
    requestStatus = input.decision === "rejected" ? "rejected" : "returned";
    await supabase
      .from("approval_requests")
      .update({ status: requestStatus, decided_at: new Date().toISOString() })
      .eq("id", request.id);
  } else {
    // Any further pending steps on this request?
    const { count: remaining } = await supabase
      .from("approval_steps")
      .select("id", { count: "exact", head: true })
      .eq("approval_request_id", request.id)
      .eq("status", "pending");
    if (!remaining || remaining === 0) {
      requestStatus = "approved";
      await supabase
        .from("approval_requests")
        .update({ status: "approved", decided_at: new Date().toISOString() })
        .eq("id", request.id);
    } else {
      await supabase
        .from("approval_requests")
        .update({ current_step: step.step_order + 1 })
        .eq("id", request.id);
      await supabase
        .from("approval_steps")
        .update({ started_at: new Date().toISOString() })
        .eq("approval_request_id", request.id)
        .eq("step_order", step.step_order + 1);
    }
  }

  // Area 09 approval.approved / approval.rejected (spec §3 Area 02 row).
  // Only the two outcomes the catalogue defines — "returned" sends the
  // request back a step rather than concluding it, so it has no terminal
  // notification of its own today (same scope note as other partial
  // coverage this engagement has disclosed). requesterUserId comes from
  // the `request` row just read from approval_requests, never from caller
  // input, so it's a trusted value for the static_user selector even
  // though notification_events can otherwise be inserted by any
  // authenticated org member.
  if (requestStatus === "approved" || requestStatus === "rejected") {
    const eventId = await emitNotificationEvent(supabase, {
      orgId: input.orgId,
      eventType: requestStatus === "approved" ? "approval.approved" : "approval.rejected",
      aggregateType: "approval_request",
      aggregateId: request.id,
      actorId: actorUserId,
      idempotencyKey: `approval.${requestStatus}:${request.id}`,
      payload: {
        requestId: request.id,
        requesterUserId: request.requested_by,
        defaultTitle: requestStatus === "approved" ? "Your request was approved" : "Your request was rejected",
        defaultMessage:
          input.comment ??
          (requestStatus === "approved" ? "Your approval request was approved." : "Your approval request was rejected."),
        defaultActionUrl: "/dashboard/approvals",
      },
    });
    if (eventId) {
      await processEventImmediately(createAdminClient(), eventId).catch((err) => console.error("processEventImmediately failed:", err));
    }
  }

  await recordAuditEvent(supabase, {
    orgId: input.orgId,
    actorUserId,
    action: `approval.${input.decision}`,
    resourceType: "approval_request",
    resourceId: request.id,
    eventCategory: "approval",
    after: { status: requestStatus, delegated: Boolean(delegatedFrom) },
  });

  return { requestId: request.id, requestStatus };
}
