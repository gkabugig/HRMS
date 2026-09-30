import { STATUS_LABELS } from "@/lib/payroll/state-machine";
import type { PayrollApprovalRecord } from "@/lib/payroll/command-centre-types";

export default function ApprovalPanel({ approvals }: { approvals: PayrollApprovalRecord[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Approval History</h2>
      {approvals.length === 0 ? (
        <p className="text-sm text-neutral-400">No approval decisions recorded yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {approvals.map((a) => (
            <li key={a.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-900">
                  {STATUS_LABELS[a.stage as keyof typeof STATUS_LABELS] ?? a.stage} — {a.decision}
                </span>
                <span className="text-xs text-neutral-400">{new Date(a.decidedAt).toLocaleString("en-KE")}</span>
              </div>
              <p className="text-xs text-neutral-500">
                {a.approverName ?? "Unknown approver"}
                {a.comment && <span> — &ldquo;{a.comment}&rdquo;</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
