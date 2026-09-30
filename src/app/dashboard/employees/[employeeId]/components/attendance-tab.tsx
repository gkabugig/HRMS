import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

export function AttendanceTab({ data }: { data: Employee360 }) {
  const a = data.attendance;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi value={a.attendancePct != null ? `${a.attendancePct}%` : "—"} label={`Attendance (last ${a.windowDays} days)`} />
        <Kpi value={String(a.lateDays)} label="Late arrivals" />
        <Kpi value={String(a.recordedDays)} label="Days recorded" />
      </div>

      <div className="flex justify-end">
        <Link href="/dashboard/attendance" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
          Open full Attendance module →
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900">Recent Records</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock in</th>
              <th className="px-4 py-2 font-medium">Clock out</th>
            </tr>
          </thead>
          <tbody>
            {a.recent.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{r.work_date}</td>
                <td className="px-4 py-2 font-mono">{r.clock_in ?? "—"}</td>
                <td className="px-4 py-2 font-mono">{r.clock_out ?? "—"}</td>
              </tr>
            ))}
            {a.recent.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400">
                  No attendance records yet.
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
