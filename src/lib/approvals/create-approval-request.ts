import type { SupabaseClient } from "@supabase/supabase-js";

// Generic approval engine (Phase 2 spec Part 2, §10; extended for Area 02's
// Universal Approval Engine). Any module can open a request here instead of
// building its own approve/reject flow — this pass wires it into Employee
// Data Change (profile_change_requests), now driven by a versioned
// approval_definitions row via start-approval.ts rather than a hand-built
// steps array. Leave and Payroll keep their existing, already-functional
// decision flows rather than being rewired onto this (per the spec's own
// "reuse where it already solves the requirement" allowance — Payroll's
// bespoke payroll_approvals system is treated the same way).
//
// definitionId/definitionVersion/definitionStepId/dueAt are all optional and
// additive (supabase/migrations/0039) — every pre-existing caller that built
// its steps by hand (none currently do outside this file's own callers)
// keeps working unchanged with them omitted.
export type ApprovalStepInput = {
  approverUserId?: string | null;
  approverRole?: string | null;
  definitionStepId?: string | null;
  dueAt?: string | null;
};

// Requests raised by a system administrator are never left to a single
// reviewer: the HR Manager reviews first, then the head of the organisation
// (CEO) signs off. Each step is skipped if it can't apply (no HR user other
// than the requester, no CEO marked or the CEO has no login, or the
// requester IS the CEO), and if neither applies the original steps stand.
async function administratorSteps(supabase: SupabaseClient, orgId: string, requestedBy: string): Promise<ApprovalStepInput[] | null> {
  const { data: requester } = await supabase.from("app_users").select("role").eq("id", requestedBy).maybeSingle();
  if (requester?.role !== "admin") return null;

  const { data: hrUsers } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", "hr");
  const { data: head } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_head_of_organisation", true)
    .maybeSingle();
  const { data: ceoUser } = head
    ? await supabase.from("app_users").select("id").eq("employee_id", head.id).maybeSingle()
    : { data: null };

  const steps: ApprovalStepInput[] = [];
  if ((hrUsers ?? []).some((u) => u.id !== requestedBy)) steps.push({ approverRole: "hr" });
  if (ceoUser && ceoUser.id !== requestedBy) steps.push({ approverUserId: ceoUser.id as string });
  return steps.length > 0 ? steps : null;
}

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
    definitionId?: string | null;
    definitionVersion?: number | null;
    dueAt?: string | null;
  }
): Promise<string> {
  // Auto-approved requests (no steps) stay that way; everything else raised by
  // an administrator goes HR Manager -> CEO.
  const steps = input.steps.length > 0 ? ((await administratorSteps(supabase, input.orgId, input.requestedBy)) ?? input.steps) : input.steps;

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
      definition_id: input.definitionId ?? null,
      definition_version: input.definitionVersion ?? null,
      due_at: input.dueAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("approval_steps").insert(
    steps.map((s, i) => ({
      approval_request_id: request.id,
      step_order: i + 1,
      approver_user_id: s.approverUserId ?? null,
      approver_role: s.approverRole ?? null,
      definition_step_id: s.definitionStepId ?? null,
      due_at: s.dueAt ?? null,
      started_at: i === 0 ? new Date().toISOString() : null,
    }))
  );

  await supabase.from("approval_actions").insert({
    approval_request_id: request.id,
    actor_user_id: input.requestedBy,
    action: "submit",
    from_status: "draft",
    to_status: "pending_approval",
  });

  return request.id as string;
}
