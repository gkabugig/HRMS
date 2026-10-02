// Area 06 §10 "Leave Workspace" — upcoming/on-leave-today/pending team leave
// and balances, scoped to the manager's direct reports.
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getTeamLeave } from "@/lib/manager/get-team-leave";
import EmptyState from "@/components/employee-portal/empty-state";
import Link from "next/link";

function LeaveRow({ name, type, start, end, status }: { name: string; type: string; start: string; end: string; status: string }) {
  return (
    <li className="flex items-center justify-between text-sm border-b border-neutral-100 dark:border-neutral-800 pb-2 last:border-0">
      <div>
        <p className="text-neutral-900 dark:text-neutral-50">{name}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{type} · {start} to {end}</p>
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{status}</span>
    </li>
  );
}

export default async function ManagerLeavePage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const today = new Date().toISOString().slice(0, 10);
  const data = await getTeamLeave(supabase, ctx.orgId, scope.employeeIds, today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Team Leave</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Upcoming leave, pending approvals, and balances for your team.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">On leave today ({data.onLeaveToday.length})</h2>
          {data.onLeaveToday.length === 0 ? (
            <EmptyState message="No one is on leave today." />
          ) : (
            <ul className="space-y-2">
              {data.onLeaveToday.map((l) => (
                <LeaveRow key={l.id} name={l.employees?.name ?? "—"} type={l.leave_type} start={l.start_date} end={l.end_date} status={l.status} />
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Pending approvals ({data.pendingApprovals.length})</h2>
          {data.pendingApprovals.length === 0 ? (
            <EmptyState message="Nothing awaiting your decision." actionLabel="Open Approvals Centre" actionHref="/dashboard/approvals" />
          ) : (
            <ul className="space-y-2">
              {data.pendingApprovals.map((l) => (
                <LeaveRow key={l.id} name={l.employees?.name ?? "—"} type={l.leave_type} start={l.start_date} end={l.end_date} status={l.status} />
              ))}
            </ul>
          )}
          {data.pendingApprovals.length > 0 && (
            <Link href="/dashboard/approvals" className="inline-block mt-3 text-xs font-medium text-brand-600 hover:underline">
              Review in Approvals Centre →
            </Link>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Upcoming approved leave</h2>
          {data.upcoming.length === 0 ? (
            <EmptyState message="No upcoming approved leave." />
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((l) => (
                <LeaveRow key={l.id} name={l.employees?.name ?? "—"} type={l.leave_type} start={l.start_date} end={l.end_date} status={l.status} />
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Balances</h2>
          {data.balances.length === 0 ? (
            <EmptyState message="No leave balances on file." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700 dark:text-neutral-200">
              {data.balances.map((b, i) => (
                <li key={i} className="flex justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1 last:border-0">
                  <span>{b.employeeName} <span className="text-xs text-neutral-400 dark:text-neutral-500">· {b.leaveType}</span></span>
                  <span className="font-mono">{b.remaining}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
