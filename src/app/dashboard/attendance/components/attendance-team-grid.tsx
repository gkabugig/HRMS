export function DepartmentBreakdown({ breakdown }: { breakdown: { department: string; presentPct: number; headcount: number }[] }) {
  if (breakdown.length === 0) return null;
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Team / Department breakdown</h2>
      <div className="space-y-2">
        {breakdown.map((d) => (
          <div key={d.department} className="flex items-center gap-3 text-sm">
            <span className="w-32 shrink-0 truncate text-neutral-700">{d.department}</span>
            <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${d.presentPct >= 90 ? "bg-green-500" : d.presentPct >= 75 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${d.presentPct}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-neutral-500 text-xs">
              {d.presentPct}% · {d.headcount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
