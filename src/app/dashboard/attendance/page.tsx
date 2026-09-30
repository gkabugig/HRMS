import { createClient } from "@/lib/supabase/server";
import { recordAttendance } from "./actions";

// Fallback when an employee has no shift assigned (Working Schedule module) —
// same default this app used before shifts existed.
const DEFAULT_START = "08:00";
const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_STANDARD_HOURS = 8;

type Shift = { start_time: string; end_time: string; grace_minutes: number };

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function standardHoursFor(shift: Shift | undefined): number {
  if (!shift) return DEFAULT_STANDARD_HOURS;
  const mins = toMinutes(shift.end_time) - toMinutes(shift.start_time);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : DEFAULT_STANDARD_HOURS;
}

function isLate(clockIn: string | null, shift: Shift | undefined): boolean {
  if (!clockIn) return false;
  const expectedStart = shift ? shift.start_time : DEFAULT_START;
  const grace = shift ? shift.grace_minutes : DEFAULT_GRACE_MINUTES;
  return toMinutes(clockIn) > toMinutes(expectedStart) + grace;
}

function hoursWorked(clockIn: string | null, clockOut: string | null): number | null {
  if (!clockIn || !clockOut) return null;
  const minutes = toMinutes(clockOut) - toMinutes(clockIn);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

// Regulation of Wages overtime rates: 1.5x on ordinary working days, 2x on
// rest days/public holidays. This flags overtime from logged hours so HR
// can see it — it doesn't yet feed into payroll (that needs an hourly rate
// per employee, tracked separately as a bigger follow-on piece of work).
function overtimeHours(clockIn: string | null, clockOut: string | null, shift: Shift | undefined): number {
  const hours = hoursWorked(clockIn, clockOut);
  if (hours === null) return 0;
  return Math.max(0, Math.round((hours - standardHoursFor(shift)) * 100) / 100);
}

// Employment Act s.27: at least one rest day in every 7. Flags any run of 7+
// consecutive calendar days with a clock-in and no gap, per employee, over
// the attendance rows currently loaded (a best-effort check over what's on
// screen, not the employee's whole history).
function restDayViolations(rows: { employee_id: string; work_date: string }[]): Set<string> {
  const byEmployee = new Map<string, string[]>();
  for (const r of rows) {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id)!.push(r.work_date);
  }
  const violating = new Set<string>();
  for (const [employeeId, dates] of byEmployee) {
    const sorted = [...new Set(dates)].sort();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const cur = new Date(sorted[i]);
      const dayGap = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      streak = dayGap === 1 ? streak + 1 : 1;
      if (streak >= 7) {
        violating.add(employeeId);
        break;
      }
    }
  }
  return violating;
}

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

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";
  const canPickEmployee = isHrLike || appUser?.role === "manager";

  const [{ data: records }, { data: employees }, { data: shiftAssignments }] = await Promise.all([
    supabase
      .from("attendance")
      .select("id, employee_id, work_date, clock_in, clock_out, source, employees(name)")
      .order("work_date", { ascending: false })
      .limit(100),
    canPickEmployee
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
    supabase
      .from("employee_shifts")
      .select("employee_id, shift_patterns(start_time, end_time, grace_minutes)"),
  ]);

  const shiftByEmployee = new Map<string, Shift>(
    (shiftAssignments ?? [])
      .map((a) => {
        const pattern = a.shift_patterns as unknown as Shift | null;
        return pattern ? ([a.employee_id, pattern] as const) : null;
      })
      .filter((entry): entry is readonly [string, Shift] => entry !== null)
  );

  const restViolations = restDayViolations(
    (records ?? []).map((r) => ({ employee_id: r.employee_id, work_date: r.work_date }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isHrLike ? "Attendance" : appUser?.role === "manager" ? "Team Attendance" : "My Attendance"}
      </h1>

      {restViolations.size > 0 && (
        <p className="text-xs bg-red-50 text-red-700 border border-red-100 rounded px-3 py-2">
          {restViolations.size} employee(s) below have worked 7+ consecutive days with no rest day
          (Employment Act s.27 requires at least one rest day per 7).
        </p>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {canPickEmployee && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock In</th>
              <th className="px-4 py-2 font-medium">Clock Out</th>
              <th className="px-4 py-2 font-medium">Overtime</th>
              <th className="px-4 py-2 font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => {
              const shift = shiftByEmployee.get(r.employee_id);
              const overtime = overtimeHours(r.clock_in, r.clock_out, shift);
              return (
                <tr key={r.id} className="border-t border-neutral-100">
                  {canPickEmployee && (
                    <td className="px-4 py-2">
                      {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-2">{r.work_date}</td>
                  <td className="px-4 py-2 font-mono">{r.clock_in ?? "—"}</td>
                  <td className="px-4 py-2 font-mono">{r.clock_out ?? "—"}</td>
                  <td className="px-4 py-2 font-mono">{overtime > 0 ? `${overtime}h` : "—"}</td>
                  <td className="px-4 py-2">
                    {isLate(r.clock_in, shift) && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Late</span>
                    )}
                    {!r.clock_out && r.clock_in && (
                      <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded ml-1">
                        No clock-out
                      </span>
                    )}
                    {restViolations.has(r.employee_id) && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded ml-1">
                        No rest day
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={canPickEmployee ? 6 : 5} className="px-4 py-6 text-center text-neutral-400">
                  No attendance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">
          {canPickEmployee ? "Record attendance" : "Clock in / out"}
        </h2>
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
            defaultValue={new Date().toISOString().slice(0, 10)}
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
