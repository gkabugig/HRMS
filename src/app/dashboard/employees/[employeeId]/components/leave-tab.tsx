import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-red-100 text-red-700",
};

export function LeaveTab({ data }: { data: Employee360 }) {
  const l = data.leave;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi value={`${l.annualRemaining} / ${l.annualEntitlement}`} label="Annual days remaining" />
        <Kpi value={String(l.annualUsed)} label="Days used this year" />
        <Kpi value={String(l.pendingCount)} label="Pending requests" />
      </div>

      <div className="flex justify-end">
        <Link href="/dashboard/leave" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
          Open full Leave module →
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900">Recent Requests</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Dates</th>
              <th className="px-4 py-2 font-medium">Days</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {l.recent.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{r.leave_type}</td>
                <td className="px-4 py-2">
                  {r.start_date} → {r.end_date}
                </td>
                <td className="px-4 py-2">{r.days}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[r.status] ?? ""}`}>{r.status}</span>
                </td>
              </tr>
            ))}
            {l.recent.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  No leave requests yet.
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
      <p className="text-xl font-semibold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500 mt-1">{label}</p>
    </div>
  );
}
