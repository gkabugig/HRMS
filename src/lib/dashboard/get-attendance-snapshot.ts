// Attendance Snapshot (spec §9). Reuses the same shift-aware lateness rule
// as src/app/dashboard/attendance/page.tsx (grace minutes per shift,
// falling back to the app's original 08:00/15min default).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, AttendanceSnapshot } from "./dashboard-types";

const DEFAULT_START = "08:00";
const DEFAULT_GRACE_MINUTES = 15;

type Shift = { start_time: string; end_time: string; grace_minutes: number };

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isLate(clockIn: string | null, shift: Shift | undefined): boolean {
  if (!clockIn) return false;
  const expectedStart = shift ? shift.start_time : DEFAULT_START;
  const grace = shift ? shift.grace_minutes : DEFAULT_GRACE_MINUTES;
  return toMinutes(clockIn) > toMinutes(expectedStart) + grace;
}

function pct(n: number, of: number): number | null {
  return of > 0 ? Math.round((n / of) * 1000) / 10 : null;
}

async function dayCounts(
  supabase: SupabaseClient,
  employeeIds: string[],
  date: string,
  shiftByEmployee: Map<string, Shift>
) {
  if (employeeIds.length === 0) return { present: 0, late: 0, missingClockOut: 0 };
  const { data: rows } = await supabase
    .from("attendance")
    .select("employee_id, clock_in, clock_out")
    .eq("work_date", date)
    .in("employee_id", employeeIds);

  let present = 0;
  let late = 0;
  let missingClockOut = 0;
  for (const r of rows ?? []) {
    if (!r.clock_in) continue;
    present++;
    if (isLate(r.clock_in, shiftByEmployee.get(r.employee_id))) late++;
    if (!r.clock_out) missingClockOut++;
  }
  return { present, late, missingClockOut };
}

export async function getAttendanceSnapshot(
  supabase: SupabaseClient,
  context: DashboardContext,
  activeEmployeeIds: string[]
): Promise<AttendanceSnapshot> {
  const expected = activeEmployeeIds.length;

  const [{ data: shiftRows }, { data: leaveToday }] = await Promise.all([
    supabase.from("employee_shifts").select("employee_id, shift_patterns(start_time, end_time, grace_minutes)"),
    expected > 0
      ? supabase
          .from("leave_requests")
          .select("employee_id")
          .eq("status", "Approved")
          .lte("start_date", context.today)
          .gte("end_date", context.today)
          .in("employee_id", activeEmployeeIds)
      : Promise.resolve({ data: [] as { employee_id: string }[] }),
  ]);

  const shiftByEmployee = new Map<string, Shift>();
  for (const s of shiftRows ?? []) {
    const pattern = s.shift_patterns as unknown as Shift | null;
    if (pattern) shiftByEmployee.set(s.employee_id as string, pattern);
  }

  const onLeave = (leaveToday ?? []).length;
  const today = await dayCounts(supabase, activeEmployeeIds, context.today, shiftByEmployee);
  const absent = Math.max(0, expected - today.present - onLeave);

  // 7-day trend — fetched in parallel rather than one query per day.
  const last7Dates = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(context.today);
    d.setDate(d.getDate() - (6 - idx));
    return d;
  });
  const trend7dayCounts = await Promise.all(
    last7Dates.map((d) => dayCounts(supabase, activeEmployeeIds, d.toISOString().slice(0, 10), shiftByEmployee))
  );
  const trend7day = last7Dates.map((d, idx) => ({
    label: d.toLocaleDateString("en-KE", { weekday: "short" }),
    presentPct: pct(trend7dayCounts[idx].present, expected),
  }));

  return {
    date: context.today,
    present: today.present,
    presentPct: pct(today.present, expected),
    late: today.late,
    latePct: pct(today.late, expected),
    absent,
    absentPct: pct(absent, expected),
    onLeave,
    missingClockOut: today.missingClockOut,
    expected,
    trend7day,
  };
}
