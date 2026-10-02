import Link from "next/link";
import type { PayrollChanges } from "@/lib/payroll/command-centre-types";

function money(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}KES ${Math.abs(n).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export default function PayrollChangesCard({ runId, changes }: { runId: string; changes: PayrollChanges }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Payroll Changes</h2>
      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <Stat label="Headcount" value={changes.headcountDelta} />
        <Stat label="New hires" value={changes.newHires} positive />
        <Stat label="Exits" value={changes.exits} negative />
        <Stat label="Salary changes" value={changes.salaryChanges} />
        <Stat label="Gross" value={changes.grossChangePct} suffix="%" />
        <Stat label="Net" value={changes.netChangePct} suffix="%" />
      </div>
      {changes.largestIncreases.length > 0 && (
        <div className="mb-2">
          <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-1.5">Largest increases</p>
          <ul className="space-y-1">
            {changes.largestIncreases.map((d) => (
              <li key={d.employeeId} className="flex items-center justify-between text-sm">
                <Link href={`/dashboard/payroll/${runId}/employee/${d.employeeId}`} className="text-neutral-700 dark:text-neutral-200 hover:text-brand-700">
                  {d.name}
                </Link>
                <span className="font-mono text-emerald-600">{money(d.delta)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {changes.largestDecreases.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-1.5">Largest decreases</p>
          <ul className="space-y-1">
            {changes.largestDecreases.map((d) => (
              <li key={d.employeeId} className="flex items-center justify-between text-sm">
                <Link href={`/dashboard/payroll/${runId}/employee/${d.employeeId}`} className="text-neutral-700 dark:text-neutral-200 hover:text-brand-700">
                  {d.name}
                </Link>
                <span className="font-mono text-red-600">{money(d.delta)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix, positive, negative }: { label: string; value: number | null; suffix?: string; positive?: boolean; negative?: boolean }) {
  const color = value === null ? "text-neutral-400 dark:text-neutral-500" : positive && value > 0 ? "text-emerald-600" : negative && value > 0 ? "text-red-600" : "text-neutral-900 dark:text-neutral-50";
  return (
    <div>
      <div className={`text-base font-semibold ${color}`}>
        {value === null ? "—" : `${value > 0 ? "+" : ""}${value}${suffix ?? ""}`}
      </div>
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
