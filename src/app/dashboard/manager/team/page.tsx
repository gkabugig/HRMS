// Area 06 §6 "My Team" — the manager's authoritative team roster. Scope
// comes from getManagerScope() only, never a search box or client param.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getManagerTeam } from "@/lib/manager/get-manager-team";
import EmptyState from "@/components/employee-portal/empty-state";

const ATTENDANCE_STYLE: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  late: "bg-amber-100 text-amber-700",
  on_leave: "bg-blue-100 text-blue-700",
  absent: "bg-red-100 text-red-700",
  unknown: "bg-neutral-100 text-neutral-500",
};

export default async function ManagerTeamPage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const team = await getManagerTeam(supabase, scope.employeeIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">My Team</h1>
        <p className="text-sm text-neutral-500 mt-1">{team.length} employee{team.length === 1 ? "" : "s"} in your scope.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {team.length === 0 ? (
          <div className="p-4"><EmptyState message="No direct reports found." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Job title</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Today</th>
                <th className="px-4 py-2 font-medium">Pending leave</th>
                <th className="px-4 py-2 font-medium">Learning overdue</th>
              </tr>
            </thead>
            <tbody>
              {team.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/manager/team/${t.id}`} className="text-neutral-900 hover:text-brand-600 font-medium">
                      {t.name}
                    </Link>
                    <p className="text-xs text-neutral-400">{t.staffNo}</p>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">{t.jobTitle}</td>
                  <td className="px-4 py-2 text-neutral-700">{t.department}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ATTENDANCE_STYLE[t.attendanceToday]}`}>
                      {t.attendanceToday.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-700">{t.pendingLeaveCount > 0 ? t.pendingLeaveCount : "—"}</td>
                  <td className="px-4 py-2 text-neutral-700">{t.learningOverdueCount > 0 ? t.learningOverdueCount : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
