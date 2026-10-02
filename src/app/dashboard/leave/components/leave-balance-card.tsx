import type { LeaveBalance } from "@/lib/leave/leave-types";

export function LeaveBalanceCard({ balances, groupByEmployee }: { balances: LeaveBalance[]; groupByEmployee: boolean }) {
  if (balances.length === 0) {
    return <p className="text-sm text-neutral-400 dark:text-neutral-500 py-8 text-center">No leave policies configured yet.</p>;
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
          <tr>
            {groupByEmployee && <th className="px-4 py-2 font-medium">Employee</th>}
            <th className="px-4 py-2 font-medium">Leave Type</th>
            <th className="px-4 py-2 font-medium text-right">Entitlement</th>
            <th className="px-4 py-2 font-medium text-right">Used</th>
            <th className="px-4 py-2 font-medium text-right">Pending</th>
            <th className="px-4 py-2 font-medium text-right">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b, i) => (
            <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
              {groupByEmployee && <td className="px-4 py-2">{b.employeeName}</td>}
              <td className="px-4 py-2">{b.leaveType}</td>
              <td className="px-4 py-2 text-right">{b.entitlement}</td>
              <td className="px-4 py-2 text-right">{b.used}</td>
              <td className="px-4 py-2 text-right text-neutral-500 dark:text-neutral-400">{b.pending}</td>
              <td className={`px-4 py-2 text-right font-medium ${b.remaining < 0 ? "text-red-600" : "text-neutral-900 dark:text-neutral-50"}`}>{b.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
