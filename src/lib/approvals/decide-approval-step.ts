import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// Sequential, single-active-step approval (spec §10.2: steps execute in
// order; the request only becomes fully approved once every step has). No
// parallel-step support in this pass — every request created so far uses a
// single step, so this is the simplest engine that's actually correct for
// what's wired up today, and safe to extend if a multi-step request type
// shows up later.
export async function decideApprovalStep(
  supabase: SupabaseClient,
  input: {
    stepId: string;
    actorUserId: string;
    orgId: string;
    decision: "approved" | "rejected" | "returned";
    comment?: string | null;
  }
): Promise<{ requestId: string; requestStatus: string }> {
  const { data: step, error: stepErr } = await supabase
    .from("approval_steps")
    .select("id, approval_request_id, step_order")
    .eq("id", input.stepId)
    .single();
  if (stepErr || !step) throw new Error("Approval step not found.");

  const { data: request, error: reqErr } = await supabase
    .from("approval_requests")
    .select("id, status")
    .eq("id", step.approval_request_id)
    .single();
  if (reqErr || !request) throw new Error("Approval request not found.");

  await supabase
    .from("approval_steps")
    .update({ status: input.decision, decided_at: new Date().toISOString(), comment: input.comment ?? null })
    .eq("id", step.id);

  await supabase.from("approval_actions").insert({
    approval_request_id: request.id,
    step_id: step.id,
    actor_user_id: input.actorUserId,
    action: input.decision === "approved" ? "approve" : input.decision === "rejected" ? "reject" : "return",
    reason: input.comment ?? null,
  });

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
    }
  }

  await recordAuditEvent(supabase, {
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: `approval.${input.decision}`,
    resourceType: "approval_request",
    resourceId: request.id,
    eventCategory: "approval",
    after: { status: requestStatus },
  });

  return { requestId: request.id, requestStatus };
}
