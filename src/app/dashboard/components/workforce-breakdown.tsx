import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";

export default function WorkforceBreakdown({ workforce }: { workforce: WorkforceAnalytics }) {
  const top = workforce.departmentBreakdown.slice(0, 6);
  const max = Math.max(...top.map((d) => d.count), 1);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Department Headcount</h2>
      {top.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">No active employees yet.</p>
      ) : (
        <div className="space-y-2.5">
          {top.map((d) => (
            <div key={d.department} className="flex items-center gap-3">
              <span className="text-xs text-neutral-600 w-28 truncate shrink-0">{d.department}</span>
              <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-neutral-700 w-6 text-right shrink-0">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
