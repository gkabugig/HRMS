import { CheckCircle2 } from "lucide-react";
import type { StatutoryLine } from "@/lib/payroll/command-centre-types";

function money(n: number): string {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export default function StatutorySummary({ lines }: { lines: StatutoryLine[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Statutory Summary — Kenya</h2>
      <div className="space-y-2.5">
        {lines.map((l) => (
          <div key={l.code} className="flex items-center justify-between">
            <span className="text-sm text-neutral-700 dark:text-neutral-200">{l.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-medium text-neutral-900 dark:text-neutral-50">{money(l.employeeTotal + l.employerTotal)}</span>
              {l.ready ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                  <CheckCircle2 size={12} /> Ready
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-3">Rates are read from the org&apos;s versioned statutory rules for this period — never hard-coded.</p>
    </div>
  );
}
