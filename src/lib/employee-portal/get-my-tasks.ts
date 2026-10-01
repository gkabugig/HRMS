import type { SupabaseClient } from "@supabase/supabase-js";

// Area 05 §12 "My Tasks" — "show only human tasks assigned to the employee,
// including Area 02 approval tasks and Area 03 human workflow tasks".
// Inspection confirmed there are exactly two assignee-scoped task sources
// in the codebase today:
//   1. approval_steps where status='pending' and the current user is the
//      named approver or matches approver_role — the same "named ∪ byRole"
//      set the Approvals Centre's Pending tab computes inline
//      (src/app/dashboard/approvals/page.tsx), extracted here rather than
//      duplicated so both surfaces stay in lock-step automatically.
//   2. workflow_tasks (legacy hard-wired workflow runs — onboarding,
//      contract_renewal, offboarding — src/lib/workflows/start-workflow-run.ts)
//      where assignee_user_id = me or assignee_role = my role, status='pending'.
//      The newer Area 03 graph engine's 'task' node type is unimplemented
//      (execute-node.ts throws for it) and workflow_run_nodes has no
//      assignee column at all, so this is genuinely the only other source —
//      not an oversight.
// RLS already scopes both tables to "assigned to me" independently
// (approval_steps_approver_read/_role_read, workflow_tasks_assignee_read),
// so this reads safely even though the query below also filters in TS.
export type MyTask = {
  id: string;
  source: "approval" | "workflow";
  title: string;
  requestType: string | null;
  dueAt: string | null;
  createdAt: string;
  actionUrl: string;
};

export async function getMyTasks(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<MyTask[]> {
  const [{ data: steps }, { data: wfTasks }] = await Promise.all([
    supabase
      .from("approval_steps")
      .select(
        "id, approver_user_id, approver_role, due_at, approval_requests(id, request_type, summary, created_at)"
      )
      .eq("status", "pending")
      .order("id"),
    supabase
      .from("workflow_tasks")
      .select("id, task, due_at, created_at, workflow_run_id, assignee_user_id, assignee_role")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const myApprovalSteps = (steps ?? []).filter(
    (s) => s.approver_user_id === userId || s.approver_role === role
  );

  const approvalTasks: MyTask[] = myApprovalSteps.map((s) => {
    const req = (Array.isArray(s.approval_requests) ? s.approval_requests[0] : s.approval_requests) as {
      id: string;
      request_type: string;
      summary: string;
      created_at: string;
    } | null;
    return {
      id: s.id,
      source: "approval",
      title: req?.summary ?? "Approval request",
      requestType: req?.request_type ?? null,
      dueAt: s.due_at,
      createdAt: req?.created_at ?? new Date().toISOString(),
      actionUrl: "/dashboard/approvals",
    };
  });

  const myWorkflowTasks: MyTask[] = (wfTasks ?? [])
    .filter((t) => t.assignee_user_id === userId || t.assignee_role === role)
    .map((t) => ({
      id: t.id,
      source: "workflow",
      title: t.task,
      requestType: null,
      dueAt: t.due_at,
      createdAt: t.created_at,
      actionUrl: "/dashboard/audit-log",
    }));

  return [...approvalTasks, ...myWorkflowTasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
