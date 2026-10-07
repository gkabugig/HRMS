// Area 05 §4 — Employee Home / command centre. Canonical landing page for
// the employee portal (spec §15's "/dashboard/me — optional alias"; in this
// build it's actually the primary implementation — /dashboard redirects an
// employee role straight here, see src/app/dashboard/page.tsx).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getEmployeeHome } from "@/lib/employee-portal/get-employee-home";
import EmptyState from "@/components/employee-portal/empty-state";
import { VerticalBars } from "@/components/charts/charts";
import ChartCard from "../components/chart-card";
import { RoleHeader, StatCard, StatGrid, QuickLinks } from "../components/role-home";

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

  const firstName = home.employee.name.split(" ")[0] || home.employee.name;
  const subtitle = [
    home.employee.jobTitle,
    home.orgContext?.organisationUnitName ?? home.employee.department,
    home.orgContext?.locationName,
  ]
    .filter(Boolean)
    .join(" · ");

  const openItems = [
    { label: "Profile changes", value: home.pendingProfileChanges, color: "var(--vivid-1)", href: "/dashboard/me/profile" },
    { label: "Corrections", value: home.pendingAttendanceCorrections, color: "var(--vivid-5)", href: "/dashboard/me/attendance" },
    { label: "HR requests", value: home.openRequests, color: "var(--vivid-6)", href: "/dashboard/me/requests" },
    { label: "Tasks", value: home.tasks.length, color: "var(--vivid-4)", href: "/dashboard/me/tasks" },
    { label: "Documents", value: home.documentAlerts.length, color: "var(--vivid-2)", href: "/dashboard/me/documents" },
  ];

  return (
    <div className="space-y-6">
      <RoleHeader name={firstName} subtitle={subtitle || "Here's what needs your attention today."} />

      <StatGrid>
        <StatCard
          index={0}
          label="Leave days remaining"
          value={home.leave.annualRemaining}
          note={home.leave.pendingCount > 0 ? `${home.leave.pendingCount} pending request(s)` : "Apply for leave →"}
          noteTone={home.leave.pendingCount > 0 ? "warn" : "muted"}
          href="/dashboard/me/leave"
        />
        <StatCard
          index={1}
          label={home.pay.latestPayslip ? `Net pay — ${home.pay.latestPayslip.period}` : "Net pay"}
          value={home.pay.latestPayslip ? fmtMoney(home.pay.latestPayslip.net) : "—"}
          note={home.pay.latestPayslip ? "View payslips →" : "No published payslip yet"}
          href="/dashboard/me/pay"
        />
        <StatCard
          index={2}
          label="Unread notifications"
          value={home.notifications.unreadCount}
          note="Open inbox →"
          noteTone={home.notifications.unreadCount > 0 ? "warn" : "muted"}
          href="/dashboard/me/notifications"
        />
        <StatCard
          index={3}
          label="Today"
          value={<span className="text-xl font-mono">{home.today?.clockIn ?? "—"}{home.today?.clockOut ? ` → ${home.today.clockOut}` : ""}</span>}
          note={home.today ? (home.today.clockOut ? "Clocked out" : "Clocked in") : "Not clocked in yet"}
          noteTone={home.today && !home.today.clockOut ? "good" : "muted"}
          href="/dashboard/me/attendance"
        />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Open items" subtitle="Tap a bar to open it" href="/dashboard/me/requests" linkLabel="Requests" accent="var(--vivid-1)">
          {openItems.every((i) => i.value === 0) ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">Nothing is open right now.</p>
          ) : (
            <VerticalBars items={openItems} palette="vivid" multicolor compact format="int" height={160} />
          )}
        </ChartCard>

        <ChartCard title="Action Centre" href="/dashboard/me/tasks" linkLabel="Tasks" accent="var(--vivid-4)">
          {actionItems.length === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <ul className="space-y-1">
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
        </ChartCard>
      </div>

      <QuickLinks
        links={[
          { label: "Apply Leave", href: "/dashboard/me/leave" },
          { label: "Request Attendance Correction", href: "/dashboard/me/attendance" },
          { label: "Update Profile", href: "/dashboard/me/profile" },
          { label: "View Payslip", href: "/dashboard/me/pay" },
          { label: "Upload Document", href: "/dashboard/me/documents" },
          { label: "Contact HR", href: "/dashboard/me/requests" },
        ]}
      />
    </div>
  );
}
