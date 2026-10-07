// Area 06 §4/§20 "Manager Home" — the manager workspace landing page. All
// data comes from getManagerHome(), the single top-level aggregator that
// resolves scope once and fans out to every team slice in parallel.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagerHome } from "@/lib/manager/get-manager-home";
import EmptyState from "@/components/employee-portal/empty-state";
import { Doughnut, VerticalBars } from "@/components/charts/charts";
import ChartCard from "../components/chart-card";
import { RoleHeader, StatCard, StatGrid, QuickLinks } from "../components/role-home";

const ALERT_LABEL: Record<string, string> = {
  approval_overdue: "Approval overdue",
  attendance_correction: "Attendance correction",
  leave_upcoming: "Upcoming leave",
  learning_overdue: "Learning overdue",
  appraisal_due: "Appraisal due",
  document_expiring: "Document expiring",
  service_request: "Service request",
  requisition_pending: "Requisition action",
};

export default async function ManagerHomePage() {
  const supabase = await createClient();
  const home = await getManagerHome(supabase);

  const onLeaveToday = home.team.filter((t) => t.onLeave).length;
  const lateToday = home.team.filter((t) => t.attendanceToday === "late").length;
  const absentToday = home.team.filter((t) => t.attendanceToday === "absent").length;
  const openRequests = home.requests.filter((r) => !["Resolved", "Closed"].includes(r.status)).length;
  const presentToday = home.team.filter((t) => t.attendanceToday === "present" || t.attendanceToday === "late").length;

  const alertCounts = Object.entries(
    home.alerts.reduce<Record<string, number>>((acc, a) => {
      acc[a.category] = (acc[a.category] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([cat, value]) => ({ label: ALERT_LABEL[cat] ?? cat, value, href: "/dashboard/manager/requests" }));

  const attendanceItems = [
    { label: "Present", value: presentToday - lateToday, color: "var(--vivid-3)", href: "/dashboard/manager/attendance" },
    { label: "Late", value: lateToday, color: "var(--vivid-4)", href: "/dashboard/manager/attendance" },
    { label: "Absent", value: absentToday, color: "var(--vivid-2)", href: "/dashboard/manager/attendance" },
    { label: "On leave", value: onLeaveToday, color: "var(--vivid-5)", href: "/dashboard/manager/leave" },
  ];

  return (
    <div className="space-y-6">
      <RoleHeader
        name="Manager"
        subtitle={`${home.team.length} direct report${home.team.length === 1 ? "" : "s"}${
          home.scopeTier !== "direct_reports" && home.scopeTier !== "none" ? ` · scope: ${home.scopeTier.replace("_", " ")}` : ""
        }`}
      />

      <StatGrid>
        <StatCard index={0} label="Present today" value={`${presentToday}/${home.team.length}`} href="/dashboard/manager/attendance" note="Team attendance →" />
        <StatCard index={1} label="On leave today" value={onLeaveToday} href="/dashboard/manager/leave" note="Team leave →" />
        <StatCard index={2} label="Tasks assigned to you" value={home.tasks.length} href="/dashboard/manager/tasks" noteTone={home.tasks.length > 0 ? "warn" : "muted"} note={home.tasks.length > 0 ? "Open tasks →" : undefined} />
        <StatCard index={3} label="Open team requests" value={openRequests} href="/dashboard/manager/requests" noteTone={openRequests > 0 ? "warn" : "muted"} note="Team requests →" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Team — Today" href="/dashboard/manager/attendance" linkLabel="Attendance" accent="var(--vivid-3)">
          {attendanceItems.every((i) => i.value === 0) ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No attendance recorded yet today.</p>
          ) : (
            <Doughnut items={attendanceItems} palette="vivid" centreLabel="today" />
          )}
        </ChartCard>

        <ChartCard title="Needs your attention" subtitle="By type" href="/dashboard/manager/requests" linkLabel="Requests" accent="var(--vivid-2)">
          {alertCounts.length === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <VerticalBars items={alertCounts} palette="vivid" multicolor compact format="int" height={160} />
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Alerts" href="/dashboard/manager/requests" linkLabel="All requests" accent="var(--vivid-4)">
          {home.alerts.length === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <ul className="space-y-2">
              {home.alerts.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">{ALERT_LABEL[a.category] ?? a.category}</p>
                    <p className="text-neutral-700 dark:text-neutral-200">{a.message}{a.employeeName ? ` — ${a.employeeName}` : ""}</p>
                  </div>
                  {a.dueAt && <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">{a.dueAt}</span>}
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Your team" href="/dashboard/manager/team" linkLabel="View all" accent="var(--vivid-1)">
          {home.team.length === 0 ? (
            <EmptyState message="No direct reports found." />
          ) : (
            <ul className="space-y-2">
              {home.team.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <Link href={`/dashboard/manager/team/${t.id}`} className="text-neutral-700 dark:text-neutral-200 hover:text-brand-600">
                    {t.name} <span className="text-xs text-neutral-400 dark:text-neutral-500">· {t.jobTitle}</span>
                  </Link>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      t.attendanceToday === "present"
                        ? "bg-green-100 text-green-700"
                        : t.attendanceToday === "late"
                          ? "bg-amber-100 text-amber-700"
                          : t.attendanceToday === "on_leave"
                            ? "bg-blue-100 text-blue-700"
                            : t.attendanceToday === "absent"
                              ? "bg-red-100 text-red-700"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {t.attendanceToday.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <QuickLinks
        links={[
          { label: "Attendance", href: "/dashboard/manager/attendance" },
          { label: "Leave", href: "/dashboard/manager/leave" },
          { label: "Performance", href: "/dashboard/manager/performance" },
          { label: "Learning", href: "/dashboard/manager/learning" },
          { label: "Recruitment", href: "/dashboard/manager/recruitment" },
          { label: "Team requests", href: "/dashboard/manager/requests" },
          { label: "Team analytics", href: "/dashboard/manager/analytics" },
          { label: "Organisation", href: "/dashboard/manager/organisation" },
        ]}
      />
    </div>
  );
}
