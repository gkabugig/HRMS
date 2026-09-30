import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import { isCommandCentreRole, canCorrectAttendance } from "@/lib/attendance/attendance-permissions";
import { getAttendanceCommandCentre } from "@/lib/attendance/get-attendance-command-centre";
import { AttendanceKpiGrid } from "./components/attendance-kpis";
import { AttendanceTrend } from "./components/attendance-trend";
import { AttendanceExceptions } from "./components/attendance-exceptions";
import { DepartmentBreakdown } from "./components/attendance-team-grid";
import { recordAttendance } from "./actions";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const role = (appUser?.role ?? "employee") as UserRole;
  const isHrLike = role === "admin" || role === "hr";
  const canPickEmployee = isHrLike || role === "manager";
  const showCommandCentre = isCommandCentreRole(role);

  const today = new Date().toISOString().slice(0, 10);

  const [commandCentre, { data: myRecords }, { data: employees }] = await Promise.all([
    showCommandCentre ? getAttendanceCommandCentre(supabase, today) : Promise.resolve(null),
    supabase
      .from("attendance")
      .select("id, employee_id, work_date, clock_in, clock_out, source, employees(name)")
      .order("work_date", { ascending: false })
      .limit(showCommandCentre ? 30 : 15),
    canPickEmployee ? supabase.from("employees").select("id, name").eq("status", "Active").order("name") : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isHrLike ? "Attendance Command Centre" : role === "manager" ? "Team Attendance" : "My Attendance"}
      </h1>

      {showCommandCentre && commandCentre && (
        <div id="team" className="space-y-6 scroll-mt-20">
          <p className="text-sm text-neutral-500">Today · {new Date(today).toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</p>
          <AttendanceKpiGrid kpis={commandCentre.kpis} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AttendanceTrend trend={commandCentre.trend} />
            <div id="exceptions" className="scroll-mt-20">
              <AttendanceExceptions exceptions={commandCentre.exceptions} canCorrect={canCorrectAttendance(role)} />
            </div>
          </div>
          <DepartmentBreakdown breakdown={commandCentre.departmentBreakdown} />
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900">Recent records</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {canPickEmployee && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock In</th>
              <th className="px-4 py-2 font-medium">Clock Out</th>
            </tr>
          </thead>
          <tbody>
            {(myRecords ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                {canPickEmployee && <td className="px-4 py-2">{(r.employees as unknown as { name: string } | null)?.name ?? "—"}</td>}
                <td className="px-4 py-2">{r.work_date}</td>
                <td className="px-4 py-2 font-mono">{r.clock_in ?? "—"}</td>
                <td className="px-4 py-2 font-mono">{r.clock_out ?? "—"}</td>
              </tr>
            ))}
            {(!myRecords || myRecords.length === 0) && (
              <tr>
                <td colSpan={canPickEmployee ? 4 : 3} className="px-4 py-6 text-center text-neutral-400">
                  No attendance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">{canPickEmployee ? "Record attendance" : "Clock in / out"}</h2>
        <form action={recordAttendance} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          {canPickEmployee && (
            <select name="employee_id" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <input
            name="work_date"
            type="date"
            required
            defaultValue={today}
            className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
          />
          <input name="clock_in" type="time" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <input name="clock_out" type="time" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <button
            type="submit"
            className={`bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium ${canPickEmployee ? "sm:col-span-4" : "sm:col-span-1"}`}
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
