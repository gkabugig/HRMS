import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

export function PayrollTab({ data }: { data: Employee360 }) {
  const p = data.payroll;

  if (!p.visible) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-6 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Salary and payroll details are restricted for your role. Aggregated team cost information may be
          available from Reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi value={p.currentGross !== null ? `KES ${Math.round(p.currentGross).toLocaleString()}` : "—"} label="Current gross" />
        <Kpi value={p.latestPayslip ? `KES ${Math.round(p.latestPayslip.net).toLocaleString()}` : "—"} label="Latest net pay" />
        <Kpi value={p.latestPayslip?.period ?? "—"} label="Latest period" />
      </div>

      <div className="flex justify-end">
        <Link href="/dashboard/payroll" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
          View all payslips →
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Compensation History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium text-right">Basic</th>
              <th className="px-4 py-2 font-medium text-right">House</th>
              <th className="px-4 py-2 font-medium text-right">Transport</th>
              <th className="px-4 py-2 font-medium text-right">Other</th>
              <th className="px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {p.compensationHistory.map((h) => (
              <tr key={h.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">{h.effective_from}</td>
                <td className="px-4 py-2">{h.effective_to ?? "Present"}</td>
                <td className="px-4 py-2 text-right font-mono">{Math.round(h.basic).toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{Math.round(h.house_allowance).toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{Math.round(h.transport_allowance).toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{Math.round(h.other_allowance).toLocaleString()}</td>
                <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{h.reason ?? "—"}</td>
              </tr>
            ))}
            {p.compensationHistory.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No compensation history recorded yet — it starts building the next time pay changes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{label}</p>
    </div>
  );
}
