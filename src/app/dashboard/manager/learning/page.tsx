// Area 06 §12 "Learning Workspace" — mandatory-course completion across the
// team and who's overdue.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getTeamLearning } from "@/lib/manager/get-team-learning";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ManagerLearningPage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const data = await getTeamLearning(supabase, scope.employeeIds);
  const pct = data.mandatoryCompletion.total > 0 ? Math.round((data.mandatoryCompletion.completed / data.mandatoryCompletion.total) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Learning</h1>
        <p className="text-sm text-neutral-500 mt-1">Mandatory course completion across your team.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Mandatory completion</p>
          <p className="text-2xl font-semibold text-neutral-900">{pct !== null ? `${pct}%` : "—"}</p>
          <p className="text-xs text-neutral-500">{data.mandatoryCompletion.completed}/{data.mandatoryCompletion.total}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Overdue items</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.overdueByEmployee.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Overdue mandatory training</h2>
          {data.overdueByEmployee.length === 0 ? (
            <EmptyState message="No overdue mandatory training." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.overdueByEmployee.map((o, i) => (
                <li key={i} className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-0">
                  <Link href={`/dashboard/manager/team/${o.employeeId}`} className="text-neutral-900 hover:text-brand-600">{o.employeeName}</Link>
                  <span className="text-xs text-neutral-500">{o.courseName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Recent completions</h2>
          {data.recentCompletions.length === 0 ? (
            <EmptyState message="No completions recorded yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentCompletions.map((c, i) => (
                <li key={i} className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-0">
                  <span className="text-neutral-900">{c.employeeName}</span>
                  <span className="text-xs text-neutral-500">{c.courseName} · {c.completedOn}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
