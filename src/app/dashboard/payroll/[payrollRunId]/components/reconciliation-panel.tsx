import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { ReconciliationCheck } from "@/lib/payroll/command-centre-types";

export default function ReconciliationPanel({ checks }: { checks: ReconciliationCheck[] }) {
  const allOk = checks.every((c) => c.ok);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Reconciliation Centre</h2>
        <span className={`text-xs font-medium ${allOk ? "text-emerald-600" : "text-amber-600"}`}>{allOk ? "All reconciled" : "Needs attention"}</span>
      </div>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
            )}
            <span>
              <span className="text-neutral-700 dark:text-neutral-200">{c.label}</span>
              {c.detail && <span className="block text-xs text-neutral-400 dark:text-neutral-500">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
