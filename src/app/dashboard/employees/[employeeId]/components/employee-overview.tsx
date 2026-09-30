import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";
import { AttentionCard } from "./attention-card";

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <p className="text-2xl font-semibold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

export function EmployeeOverview({ data, employeeId }: { data: Employee360; employeeId: string }) {
  const perf = data.performance.latest;
  const payrollValue = data.payroll.visible
    ? data.payroll.currentGross !== null
      ? `KES ${Math.round(data.payroll.currentGross).toLocaleString()}`
      : "—"
    : "Restricted";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi value={perf?.final_score != null ? `${perf.final_score} / 5` : "—"} label="Performance" />
        <Kpi value={`${data.leave.annualRemaining} days`} label="Leave left" />
        <Kpi
          value={data.attendance.attendancePct != null ? `${data.attendance.attendancePct}%` : "—"}
          label="Attendance (90d)"
        />
        <Kpi value={payrollValue} label="Gross pay" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AttentionCard alerts={data.alerts} />

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Employment Summary</h2>
          <dl className="text-sm space-y-2">
            <Row label="Employment type" value={data.employee.employment_type as string} />
            <Row label="Department" value={data.employee.department as string} />
            <Row label="Manager" value={data.manager?.name ?? "—"} />
            <Row
              label="Hire date"
              value={new Date(data.employee.date_of_hire as string).toLocaleDateString("en-KE", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            />
          </dl>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Recent Activity</h2>
          {data.activity.length === 0 ? (
            <p className="text-sm text-neutral-400">No recorded activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2">
                  <span className="text-neutral-700 capitalize">{a.title}</span>
                  <span className="text-xs text-neutral-400 shrink-0">
                    {new Date(a.at).toLocaleDateString("en-KE")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/dashboard/employees/${employeeId}?tab=activity`}
            className="text-xs text-brand-600 hover:text-brand-700 hover:underline mt-3 inline-block"
          >
            View all activity →
          </Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Leave &amp; Attendance</h2>
          <dl className="text-sm space-y-2">
            <Row
              label="Attendance"
              value={data.attendance.attendancePct != null ? `${data.attendance.attendancePct}% (last ${data.attendance.recordedDays} recorded days)` : "No records yet"}
            />
            <Row label="Annual leave remaining" value={`${data.leave.annualRemaining} of ${data.leave.annualEntitlement} days`} />
            <Row label="Pending requests" value={String(data.leave.pendingCount)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900 font-medium text-right">{value}</dd>
    </div>
  );
}
