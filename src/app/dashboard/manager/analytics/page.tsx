// Area 06 §15 "Team Analytics" — reuses getWorkforceAnalytics() (via
// getManagerAnalytics) directly, scoped to the manager's team, so the
// numbers here are computed by the exact same formulas as the HR-facing
// Workforce Analytics dashboard (spec §27).
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getManagerAnalytics } from "@/lib/manager/get-manager-analytics";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ManagerAnalyticsPage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const data = await getManagerAnalytics(supabase, ctx.orgId, ctx.employeeId, scope.employeeIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">Headcount, mix, and tenure for your team — same definitions as Workforce Analytics.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Active headcount</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.totalActive}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">12-month turnover</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.turnoverRate12mo !== null ? `${data.turnoverRate12mo}%` : "—"}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Headcount 12 months ago</p>
          <p className="text-2xl font-semibold text-neutral-900">{data.totalAtStartOf12moWindow}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Department mix</h2>
          {data.departmentBreakdown.length === 0 ? (
            <EmptyState message="No active team members." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.departmentBreakdown.map((d, i) => (
                <li key={i} className="flex justify-between border-b border-neutral-100 pb-1 last:border-0">
                  <span>{d.department}</span>
                  <span className="font-mono">{d.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Employment type mix</h2>
          {data.employmentTypeMix.length === 0 ? (
            <EmptyState message="No active team members." />
          ) : (
            <ul className="space-y-1 text-sm text-neutral-700">
              {data.employmentTypeMix.map((t, i) => (
                <li key={i} className="flex justify-between border-b border-neutral-100 pb-1 last:border-0">
                  <span>{t.type}</span>
                  <span className="font-mono">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Tenure distribution</h2>
          <ul className="space-y-1 text-sm text-neutral-700">
            {data.tenureDistribution.map((t, i) => (
              <li key={i} className="flex justify-between border-b border-neutral-100 pb-1 last:border-0">
                <span>{t.bucket}</span>
                <span className="font-mono">{t.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Headcount trend (12 months)</h2>
          <ul className="space-y-1 text-sm text-neutral-700">
            {data.headcountTrend.map((h, i) => (
              <li key={i} className="flex justify-between border-b border-neutral-100 pb-1 last:border-0">
                <span>{h.label}</span>
                <span className="font-mono">{h.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
