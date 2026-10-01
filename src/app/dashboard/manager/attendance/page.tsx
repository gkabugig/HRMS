// Area 06 §9 "Attendance Workspace" — today's counts, 7-day trend, today's
// exceptions, and pending correction requests (routed through Area 02's
// approval engine — see get-team-attendance.ts for why there's no separate
// manager-approval table).
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getTeamAttendance } from "@/lib/manager/get-team-attendance";
import EmptyState from "@/components/employee-portal/empty-state";
import Link from "next/link";

export default async function ManagerAttendancePage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const today = new Date().toISOString().slice(0, 10);
  const data = await getTeamAttendance(supabase, scope.employeeIds, today);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Attendance</h1>
        <p className="text-sm text-neutral-500 mt-1">Today&apos;s status and the last 7 days for your team.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {([
          ["Present", data.today.present],
          ["Late", data.today.late],
          ["Absent", data.today.absent],
          ["On leave", data.today.onLeave],
          ["Missing clock-out", data.today.missingClockOut],
        ] as const).map(([label, value]) => (
          <div key={label} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="text-2xl font-semibold text-neutral-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">7-day trend</h2>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 text-left">
            <tr><th className="py-1 font-medium">Date</th><th className="py-1 font-medium">Present</th><th className="py-1 font-medium">Late</th><th className="py-1 font-medium">Absent</th></tr>
          </thead>
          <tbody>
            {data.trend.map((t) => (
              <tr key={t.date} className="border-t border-neutral-100">
                <td className="py-1">{t.date}</td>
                <td className="py-1">{t.present}</td>
                <td className="py-1">{t.late}</td>
                <td className="py-1">{t.absent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Today&apos;s exceptions</h2>
          {data.exceptions.length === 0 ? (
            <EmptyState message="No exceptions today." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.exceptions.map((e, i) => (
                <li key={i} className="border-b border-neutral-100 pb-2 last:border-0">
                  <p className="text-neutral-900">{e.employeeName}</p>
                  <p className="text-xs text-neutral-500">{e.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Pending correction requests</h2>
          {data.pendingCorrections.length === 0 ? (
            <EmptyState message="Nothing awaiting your decision." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.pendingCorrections.map((c) => (
                <li key={c.stepId} className="flex items-center justify-between border-b border-neutral-100 pb-2 last:border-0">
                  <span className="text-neutral-700">{c.summary}</span>
                  <Link href={`/dashboard/approvals/${c.requestId}`} className="text-xs font-medium text-brand-600 hover:underline">Review →</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Link href="/dashboard/attendance" className="inline-block text-xs font-medium text-brand-600 hover:underline">
        Manually record attendance for a team member →
      </Link>
    </div>
  );
}
