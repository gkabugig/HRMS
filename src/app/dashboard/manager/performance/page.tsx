// Area 06 §11 "Performance Workspace" — team-level appraisal completion,
// overdue appraisals, and recent check-ins. Per-employee check-in logging
// happens on the Employee 360 manager view (team/[employeeId]), not here —
// this page is the roll-up, not another place to duplicate that form.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getTeamPerformance } from "@/lib/manager/get-team-performance";
import { getManagerTeam } from "@/lib/manager/get-manager-team";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ManagerPerformancePage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const [data, team] = await Promise.all([
    getTeamPerformance(supabase, scope.employeeIds),
    getManagerTeam(supabase, scope.employeeIds),
  ]);
  const idToName = new Map(team.map((t) => [t.id, t.name]));

  const pct = data.appraisalCompletion.total > 0 ? Math.round((data.appraisalCompletion.completed / data.appraisalCompletion.total) * 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Performance</h1>
        <p className="text-sm text-neutral-500 mt-1">Appraisal completion, overdue cycles, and recent check-ins.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Appraisal completion</p>
          <p className="text-2xl font-semibold text-neutral-900">{pct !== null ? `${pct}%` : "—"}</p>
          <p className="text-xs text-neutral-500">{data.appraisalCompletion.completed}/{data.appraisalCompletion.total}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Not yet completed</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.overdueAppraisals.length}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Check-ins logged</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.recentCheckIns.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Not yet completed</h2>
          {data.overdueAppraisals.length === 0 ? (
            <EmptyState message="All appraisals are up to date." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.overdueAppraisals.map((a) => (
                <li key={a.id} className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-0">
                  <div>
                    <p className="text-neutral-900">{a.employeeName}</p>
                    <p className="text-xs text-neutral-500">{a.cycle}</p>
                  </div>
                  <Link href={`/dashboard/performance/${a.id}`} className="text-xs font-medium text-brand-600 hover:underline">Review →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Recent check-ins</h2>
          {data.recentCheckIns.length === 0 ? (
            <EmptyState message="No check-ins logged yet." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.recentCheckIns.map((c) => (
                <li key={c.id} className="border-b border-neutral-100 pb-2 last:border-0">
                  <Link href={`/dashboard/manager/team/${c.employeeId}`} className="text-neutral-900 hover:text-brand-600">
                    {idToName.get(c.employeeId) ?? c.employeeName}
                  </Link>
                  <p className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleDateString("en-KE")} — {c.notes}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Link href="/dashboard/performance" className="inline-block text-xs font-medium text-brand-600 hover:underline">
        Start a new appraisal cycle →
      </Link>
    </div>
  );
}
