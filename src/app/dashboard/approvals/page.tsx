import { createClient } from "@/lib/supabase/server";
import ApprovalInboxRow from "./approval-inbox-row";

// "My Approvals" inbox (Phase 2 spec §10.4) — every pending approval_steps
// row where the signed-in user is either the named approver, or an
// admin/hr user and the step is assigned to the 'hr' role rather than a
// specific person. RLS (approval_steps_approver_read / _hr_full) already
// scopes this correctly; the query here just expresses both cases.
export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();

  const { data: steps } = await supabase
    .from("approval_steps")
    .select(
      "id, step_order, approver_user_id, approver_role, status, approval_requests(id, request_type, summary, requested_by, created_at, subject_employee_id, employees:subject_employee_id(name))"
    )
    .eq("status", "pending")
    .order("id");

  // approval_steps has no org_id of its own; filter client-side to this
  // user's relevant steps (named approver, or their role when HR/admin).
  const mine = (steps ?? []).filter(
    (s) => s.approver_user_id === user.id || (s.approver_role === appUser?.role && ["admin", "hr"].includes(appUser?.role ?? ""))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">My Approvals</h1>
        <p className="text-sm text-neutral-500">
          Requests waiting on a decision from you, across every module that uses the shared approval engine.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] divide-y divide-neutral-100">
        {mine.length === 0 && <p className="px-5 py-6 text-sm text-neutral-400 text-center">Nothing waiting on you.</p>}
        {mine.map((s) => {
          const req = s.approval_requests as unknown as {
            id: string;
            request_type: string;
            summary: string;
            created_at: string;
            employees: { name: string } | null;
          } | null;
          if (!req) return null;
          return (
            <ApprovalInboxRow
              key={s.id}
              stepId={s.id}
              requestType={req.request_type}
              summary={req.summary}
              employeeName={req.employees?.name ?? null}
              createdAt={req.created_at}
            />
          );
        })}
      </div>
    </div>
  );
}
