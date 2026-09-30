import type { SupabaseClient } from "@supabase/supabase-js";

// Generic approval engine (Phase 2 spec Part 2, §10). Any module can open
// a request here instead of building its own approve/reject flow — this
// pass wires it into Employee Data Change (profile_change_requests); Leave
// and Payroll keep their existing, already-functional decision flows
// rather than being rewired onto this (per the spec's own "reuse where it
// already solves the requirement" allowance — Payroll's bespoke
// payroll_approvals system is treated the same way).
export type ApprovalStepInput = {
  approverUserId?: string | null;
  approverRole?: string | null;
};

export async function createApprovalRequest(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    requestType: string;
    entityType: string;
    entityId: string;
    requestedBy: string;
    subjectEmployeeId?: string | null;
    summary: string;
    impact?: Record<string, unknown> | null;
    steps: ApprovalStepInput[];
  }
): Promise<string> {
  const { data: request, error } = await supabase
    .from("approval_requests")
    .insert({
      org_id: input.orgId,
      request_type: input.requestType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      requested_by: input.requestedBy,
      subject_employee_id: input.subjectEmployeeId ?? null,
      summary: input.summary,
      impact_json: input.impact ?? null,
      status: "pending_approval",
      current_step: 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("approval_steps").insert(
    input.steps.map((s, i) => ({
      approval_request_id: request.id,
      step_order: i + 1,
      approver_user_id: s.approverUserId ?? null,
      approver_role: s.approverRole ?? null,
    }))
  );

  await supabase.from("approval_actions").insert({
    approval_request_id: request.id,
    actor_user_id: input.requestedBy,
    action: "submit",
  });

  return request.id as string;
}
