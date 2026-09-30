import { createClient } from "@/lib/supabase/server";
import { recordAttendance } from "./actions";

const EXPECTED_START = "08:00";
const GRACE_MINUTES = 15;

function isLate(clockIn: string | null): boolean {
  if (!clockIn) return false;
  const [eh, em] = EXPECTED_START.split(":").map(Number);
  const [ah, am] = clockIn.split(":").map(Number);
  const expectedMinutes = eh * 60 + em + GRACE_MINUTES;
  const actualMinutes = ah * 60 + am;
  return actualMinutes > expectedMinutes;
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

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase
      .from("attendance")
      .select("id, work_date, clock_in, clock_out, source, employees(name)")
      .order("work_date", { ascending: false })
      .limit(100),
    canPickEmployee
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isHrLike ? "Attendance" : appUser?.role === "manager" ? "Team Attendance" : "My Attendance"}
      </h1>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {canPickEmployee && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock In</th>
              <th className="px-4 py-2 font-medium">Clock Out</th>
              <th className="px-4 py-2 font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                {canPickEmployee && (
                  <td className="px-4 py-2">
                    {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-2">{r.work_date}</td>
                <td className="px-4 py-2 font-mono">{r.clock_in ?? "—"}</td>
                <td className="px-4 py-2 font-mono">{r.clock_out ?? "—"}</td>
                <td className="px-4 py-2">
                  {isLate(r.clock_in) && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Late</span>
                  )}
                  {!r.clock_out && r.clock_in && (
                    <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded ml-1">
                      No clock-out
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={canPickEmployee ? 5 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No attendance records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">
          {canPickEmployee ? "Record attendance" : "Clock in / out"}
        </h2>
        <form action={recordAttendance} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          {canPickEmployee && (
            <select name="employee_id" required className="border border-neutral-300 rounded px-3 py-2">
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
            className="border border-neutral-300 rounded px-3 py-2"
          />
          <input name="clock_in" type="time" className="border border-neutral-300 rounded px-3 py-2" />
          <input name="clock_out" type="time" className="border border-neutral-300 rounded px-3 py-2" />
          <button
            type="submit"
            className={`bg-neutral-900 text-white rounded py-2 font-medium ${canPickEmployee ? "sm:col-span-4" : "sm:col-span-1"}`}
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
