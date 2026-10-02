import type { AttendanceKpis } from "@/lib/attendance/attendance-types";

export function AttendanceKpiGrid({ kpis }: { kpis: AttendanceKpis }) {
  const cards = [
    { label: "Present", value: kpis.present, tone: "text-neutral-900 dark:text-neutral-50" },
    { label: "Late", value: kpis.late, tone: "text-amber-600" },
    { label: "Absent", value: kpis.absent, tone: "text-red-600" },
    { label: "Missing", value: kpis.missingClockOut, tone: "text-neutral-500 dark:text-neutral-400" },
    { label: "Overtime", value: `${kpis.overtimeHours}h`, tone: "text-neutral-900 dark:text-neutral-50" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-3 text-center">
          <p className={`text-2xl font-semibold ${c.tone}`}>{c.value}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{c.label}</p>
        </div>
      ))}
    </div>
  );
}
