// Area 06 §4/§20 "Manager Home" — the manager workspace landing page. All
// data comes from getManagerHome(), the single top-level aggregator that
// resolves scope once and fans out to every team slice in parallel.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagerHome } from "@/lib/manager/get-manager-home";
import EmptyState from "@/components/employee-portal/empty-state";

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
  const presentToday = home.team.filter((t) => t.attendanceToday === "present" || t.attendanceToday === "late").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Manager Workspace</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {home.team.length} direct report{home.team.length === 1 ? "" : "s"}
          {home.scopeTier !== "direct_reports" && home.scopeTier !== "none" ? ` · scope: ${home.scopeTier.replace("_", " ")}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Present today</p>
          <p className="text-2xl font-semibold text-neutral-900">{presentToday}/{home.team.length}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">On leave today</p>
          <p className="text-2xl font-semibold text-neutral-900">{onLeaveToday}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Tasks assigned to you</p>
          <p className="text-2xl font-semibold text-neutral-900">{home.tasks.length}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500">Open team requests</p>
          <p className="text-2xl font-semibold text-neutral-900">{home.requests.filter((r) => !["Resolved", "Closed"].includes(r.status)).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Needs your attention</h2>
          {home.alerts.length === 0 ? (
            <EmptyState message="Nothing needs your attention right now." />
          ) : (
            <ul className="space-y-2">
              {home.alerts.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-neutral-100 last:border-0">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">{ALERT_LABEL[a.category] ?? a.category}</p>
                    <p className="text-neutral-700">{a.message}{a.employeeName ? ` — ${a.employeeName}` : ""}</p>
                  </div>
                  {a.dueAt && <span className="text-xs text-neutral-400 whitespace-nowrap">{a.dueAt}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">Your team</h2>
            <Link href="/dashboard/manager/team" className="text-xs font-medium text-brand-600 hover:underline">View all →</Link>
          </div>
          {home.team.length === 0 ? (
            <EmptyState message="No direct reports found." />
          ) : (
            <ul className="space-y-2">
              {home.team.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-neutral-100 last:border-0">
                  <Link href={`/dashboard/manager/team/${t.id}`} className="text-neutral-700 hover:text-brand-600">
                    {t.name} <span className="text-xs text-neutral-400">· {t.jobTitle}</span>
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
                              : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {t.attendanceToday.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/manager/attendance" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Attendance</Link>
        <Link href="/dashboard/manager/leave" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Leave</Link>
        <Link href="/dashboard/manager/performance" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Performance</Link>
        <Link href="/dashboard/manager/learning" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Learning</Link>
        <Link href="/dashboard/manager/recruitment" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Recruitment</Link>
        <Link href="/dashboard/manager/requests" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Team requests</Link>
        <Link href="/dashboard/manager/analytics" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Team analytics</Link>
        <Link href="/dashboard/manager/organisation" className="text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 hover:border-brand-300">Organisation</Link>
      </div>
    </div>
  );
}
