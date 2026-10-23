// The day's attendance register for one or more branches: everyone assigned
// to the branch, their clock times, breaks, shift and leave, classified with
// the same classifyDay() the rest of the attendance module uses.
import type { Db } from "@/lib/hub/context";
import { classifyDay } from "../attendance/classify-day";
import type { AttendanceStatus, Shift } from "@/lib/attendance/attendance-types";
import { toMinutes } from "./rules";

export type RegisterRow = {
  employeeId: string;
  name: string;
  jobTitle: string | null;
  branchId: string;
  clockIn: string | null;
  clockOut: string | null;
  clockInPhoto: string | null;
  clockOutPhoto: string | null;
  source: string | null;
  breakMinutes: number;
  onBreak: boolean;
  onLeave: boolean;
  shift: Shift;
  status: AttendanceStatus;
  minutesLate: number;
  hoursWorked: number | null; // net of breaks
};

export const DEFAULT_SHIFT: Shift = { start_time: "08:00", end_time: "22:00", grace_minutes: 15 };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function loadRegister(db: Db, opts: { orgId: string; date: string; today: string; branchIds?: string[] }): Promise<RegisterRow[]> {
  let empQ = db.from("employees").select("id, name, job_title, branch_id").eq("org_id", opts.orgId).eq("status", "Active").not("branch_id", "is", null);
  if (opts.branchIds) empQ = empQ.in("branch_id", opts.branchIds);
  const { data: emps } = await empQ.order("name");
  const people = (emps ?? []) as { id: string; name: string; job_title: string | null; branch_id: string }[];
  if (!people.length) return [];
  const ids = people.map((p) => p.id);

  const [{ data: att }, { data: brk }, { data: shifts }, { data: leave }, { data: hol }] = await Promise.all([
    db
      .from("attendance")
      .select("employee_id, clock_in, clock_out, source, clock_in_photo_path, clock_out_photo_path")
      .eq("work_date", opts.date)
      .in("employee_id", ids),
    db.from("attendance_breaks").select("employee_id, started_at, ended_at").eq("work_date", opts.date).in("employee_id", ids),
    db.from("employee_shifts").select("employee_id, shift_patterns(start_time, end_time, grace_minutes)").in("employee_id", ids),
    db.from("leave_requests").select("employee_id").eq("status", "Approved").lte("start_date", opts.date).gte("end_date", opts.date).in("employee_id", ids),
    db.from("public_holidays").select("holiday_date").eq("holiday_date", opts.date),
  ]);

  const attBy = new Map((att ?? []).map((a) => [a.employee_id as string, a]));
  const shiftBy = new Map((shifts ?? []).map((s) => [s.employee_id as string, one(s.shift_patterns as unknown as Shift | Shift[] | null)]));
  const leaveSet = new Set((leave ?? []).map((l) => l.employee_id as string));
  const isHoliday = (hol ?? []).length > 0;
  const nowMs = Date.now();

  return people.map((p) => {
    const a = attBy.get(p.id);
    const myBreaks = (brk ?? []).filter((b) => b.employee_id === p.id);
    const breakMinutes = myBreaks.reduce((s, b) => s + Math.max(0, ((b.ended_at ? new Date(b.ended_at).getTime() : nowMs) - new Date(b.started_at).getTime()) / 60000), 0);
    const shift = shiftBy.get(p.id) ?? DEFAULT_SHIFT;
    const clockIn = a?.clock_in ? String(a.clock_in).slice(0, 5) : null;
    const clockOut = a?.clock_out ? String(a.clock_out).slice(0, 5) : null;
    const c = classifyDay({
      workDate: opts.date,
      clockIn,
      clockOut,
      onApprovedLeave: leaveSet.has(p.id),
      isHoliday,
      isWeekend: false, // branches trade every day
      isToday: opts.date === opts.today,
      isFuture: opts.date > opts.today,
      shift,
    });
    const status: AttendanceStatus = c.missingClockOut ? "Missing Clock-out" : c.status;
    return {
      employeeId: p.id,
      name: p.name,
      jobTitle: p.job_title,
      branchId: p.branch_id,
      clockIn,
      clockOut,
      clockInPhoto: a?.clock_in_photo_path ?? null,
      clockOutPhoto: a?.clock_out_photo_path ?? null,
      source: a?.source ?? null,
      breakMinutes: Math.round(breakMinutes),
      onBreak: myBreaks.some((b) => !b.ended_at),
      onLeave: leaveSet.has(p.id),
      shift,
      status,
      minutesLate: c.late && clockIn ? toMinutes(clockIn) - toMinutes(shift.start_time) : 0,
      hoursWorked: c.hoursWorked != null ? Math.max(0, Math.round((c.hoursWorked - breakMinutes / 60) * 100) / 100) : null,
    };
  });
}

// Short-lived links to private photos/files, for people already allowed to
// see the record. Always signed with the service role on the server.
export async function signedUrls(admin: Db, bucket: string, paths: (string | null | undefined)[], seconds = 600): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await admin.storage.from(bucket).createSignedUrls(list, seconds);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
