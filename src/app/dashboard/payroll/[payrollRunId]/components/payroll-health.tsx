import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { PayrollHealthCheck } from "@/lib/payroll/command-centre-types";

export default function PayrollHealth({ checks }: { checks: PayrollHealthCheck[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Payroll Health</h2>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            )}
            <span className={c.ok ? "text-neutral-700" : "text-neutral-900 font-medium"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
