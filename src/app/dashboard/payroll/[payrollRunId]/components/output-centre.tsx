import { Download } from "lucide-react";
import type { PayrollOutputRecord } from "@/lib/payroll/command-centre-types";
import type { PayrollStatus } from "@/lib/payroll/state-machine";

const OUTPUTS: { type: string; label: string; eligibleFrom: PayrollStatus[] }[] = [
  { type: "payroll_register", label: "Payroll Register (CSV)", eligibleFrom: ["calculated", "under_review", "approved", "processed", "paid", "closed"] },
  { type: "statutory_summary", label: "Statutory Summary (CSV)", eligibleFrom: ["calculated", "under_review", "approved", "processed", "paid", "closed"] },
  { type: "bank_file", label: "Bank / Payment File (CSV)", eligibleFrom: ["approved", "processed", "paid", "closed"] },
];

export default function OutputCentre({
  runId,
  status,
  outputs,
  canManage,
}: {
  runId: string;
  status: PayrollStatus;
  outputs: PayrollOutputRecord[];
  canManage: boolean;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Payment &amp; Outputs</h2>
      {canManage && (
        <div className="flex flex-wrap gap-2 mb-4">
          {OUTPUTS.map((o) => {
            const eligible = o.eligibleFrom.includes(status);
            return eligible ? (
              <a
                key={o.type}
                href={`/dashboard/payroll/${runId}/output/${o.type}`}
                className="flex items-center gap-1.5 text-xs border border-[var(--border-subtle)] hover:border-brand-300 rounded-lg px-3 py-1.5 text-neutral-700 dark:text-neutral-200"
              >
                <Download size={12} /> {o.label}
              </a>
            ) : (
              <span key={o.type} className="flex items-center gap-1.5 text-xs border border-neutral-100 dark:border-neutral-800 rounded-lg px-3 py-1.5 text-neutral-300 dark:text-neutral-600" title="Not yet eligible">
                <Download size={12} /> {o.label}
              </span>
            );
          })}
        </div>
      )}
      {outputs.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">No outputs generated yet.</p>
      ) : (
        <ul className="space-y-2">
          {outputs.map((o) => (
            <li key={o.id} className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
              <span>
                {o.outputType.replace(/_/g, " ")} — {o.rowCount} rows — {o.generatedByName ?? "Unknown"}
              </span>
              <span className="font-mono text-neutral-400 dark:text-neutral-500" title={o.checksum}>
                {o.checksum.slice(0, 8)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
