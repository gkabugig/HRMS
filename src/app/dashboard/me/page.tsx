// Area 05 §4 — Employee Home / command centre. Canonical landing page for
// the employee portal (spec §15's "/dashboard/me — optional alias"; in this
// build it's actually the primary implementation — /dashboard redirects an
// employee role straight here, see src/app/dashboard/page.tsx).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getEmployeeHome } from "@/lib/employee-portal/get-employee-home";
import EmptyState from "@/components/employee-portal/empty-state";

function fmtMoney(n: number) {
  return `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function EmployeeHomePage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const home = await getEmployeeHome(supabase, ctx);

  const actionItems = [
    ...(home.pendingProfileChanges > 0
      ? [{ label: `${home.pendingProfileChanges} profile change request(s) awaiting HR`, href: "/dashboard/me/profile" }]
      : []),
    ...(home.pendingAttendanceCorrections > 0
      ? [{ label: `${home.pendingAttendanceCorrections} attendance correction(s) under review`, href: "/dashboard/me/attendance" }]
      : []),
    ...(home.openRequests > 0 ? [{ label: `${home.openRequests} open HR request(s)`, href: "/dashboard/me/requests" }] : []),
    ...(home.tasks.length > 0 ? [{ label: `${home.tasks.length} task(s) assigned to you`, href: "/dashboard/me/tasks" }] : []),
    ...home.documentAlerts.map((d) => ({
      label:
        d.reason === "acknowledgement_required"
          ? `Acknowledge: ${d.fileName}`
          : d.reason === "expired"
            ? `${d.fileName} has expired`
            : `${d.fileName} expires ${d.expiryDate}`,
      href: "/dashboard/me/documents",
    })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Welcome, {home.employee.name.split(" ")[0] || home.employee.name}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {home.employee.jobTitle}
          {home.orgContext?.organisationUnitName ? ` · ${home.orgContext.organisationUnitName}` : home.employee.department ? ` · ${home.employee.department}` : ""}
          {home.orgContext?.locationName ? ` · ${home.orgContext.locationName}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Action Centre</h2>
          {actionItems.length === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <ul className="space-y-2">
              {actionItems.map((item, i) => (
                <li key={i}>
                  <Link href={item.href} className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-200 hover:text-brand-600 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                    <span>{item.label}</span>
                    <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Today</h2>
          {home.today ? (
            <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-1">
              <p>Clock in: <span className="font-mono">{home.today.clockIn ?? "—"}</span></p>
              <p>Clock out: <span className="font-mono">{home.today.clockOut ?? "—"}</span></p>
            </div>
          ) : (
            <EmptyState message="No attendance recorded yet today." />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Leave</h2>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{home.leave.annualRemaining}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">days remaining</p>
          {home.leave.pendingCount > 0 && <p className="text-xs text-amber-600 mt-1">{home.leave.pendingCount} pending request(s)</p>}
          {home.leave.nextApproved && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Next: {home.leave.nextApproved.leaveType} {home.leave.nextApproved.startDate} → {home.leave.nextApproved.endDate}
            </p>
          )}
          <Link href="/dashboard/me/leave" className="inline-block mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">Apply for leave →</Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Pay</h2>
          {home.pay.latestPayslip ? (
            <>
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{fmtMoney(home.pay.latestPayslip.net)}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">net pay — {home.pay.latestPayslip.period}</p>
            </>
          ) : (
            <p className="text-sm text-neutral-400 dark:text-neutral-500">No published payslip yet.</p>
          )}
          <Link href="/dashboard/me/pay" className="inline-block mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">View payslips →</Link>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Notifications</h2>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{home.notifications.unreadCount}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">unread</p>
          <Link href="/dashboard/me/notifications" className="inline-block mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">Open inbox →</Link>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Apply Leave", href: "/dashboard/me/leave" },
            { label: "Request Attendance Correction", href: "/dashboard/me/attendance" },
            { label: "Update Profile", href: "/dashboard/me/profile" },
            { label: "View Payslip", href: "/dashboard/me/pay" },
            { label: "Upload Document", href: "/dashboard/me/documents" },
            { label: "Contact HR", href: "/dashboard/me/requests" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="text-xs font-medium bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 hover:dark:bg-neutral-800 border border-[var(--border-subtle)] rounded-full px-3 py-1.5 text-neutral-700 dark:text-neutral-200">
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
