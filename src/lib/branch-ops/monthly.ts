// Monthly attendance summary per person, for payroll: days worked, late
// days and minutes, absences, leave, hours (net of breaks) and overtime.
import type { Db } from "@/lib/hub/context";
import { classifyDay } from "../attendance/classify-day";
import type { Shift } from "@/lib/attendance/attendance-types";
import { DEFAULT_SHIFT } from "./register";
import { toMinutes } from "./rules";

export type MonthlyRow = {
  employeeId: string;
  name: string;
  staffNo: string;
  branch: string;
  daysWorked: number;
  lateDays: number;
  minutesLate: number;
  absentDays: number;
  leaveDays: number;
  missingClockOuts: number;
  hoursWorked: number;
  overtimeHours: number;
  restDays: number;
};

export function monthDays(month: string, today: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    const s = `${month}-${String(d).padStart(2, "0")}`;
    if (s > today) break;
    out.push(s);
  }
  return out;
}

type Att = { employee_id: string; work_date: string; clock_in: string | null; clock_out: string | null };
type Brk = { employee_id: string; work_date: string; started_at: string; ended_at: string | null };
type Lv = { employee_id: string; start_date: string; end_date: string };

// Pure: everything already loaded, one row per person.
export function summariseMonth(input: {
  people: { id: string; name: string; staffNo: string; branch: string }[];
  days: string[];
  today: string;
  attendance: Att[];
  breaks: Brk[];
  leave: Lv[];
  holidays: Set<string>;
  shifts: Map<string, Shift>;
}): MonthlyRow[] {
  return input.people.map((p) => {
    const shift = input.shifts.get(p.id) ?? DEFAULT_SHIFT;
    const row: MonthlyRow = { employeeId: p.id, name: p.name, staffNo: p.staffNo, branch: p.branch, daysWorked: 0, lateDays: 0, minutesLate: 0, absentDays: 0, leaveDays: 0, missingClockOuts: 0, hoursWorked: 0, overtimeHours: 0, restDays: 0 };
    for (const day of input.days) {
      const a = input.attendance.find((x) => x.employee_id === p.id && x.work_date === day);
      const onLeave = input.leave.some((l) => l.employee_id === p.id && l.start_date <= day && l.end_date >= day);
      const clockIn = a?.clock_in ? String(a.clock_in).slice(0, 5) : null;
      const clockOut = a?.clock_out ? String(a.clock_out).slice(0, 5) : null;
      const c = classifyDay({ workDate: day, clockIn, clockOut, onApprovedLeave: onLeave, isHoliday: input.holidays.has(day), isWeekend: false, isToday: day === input.today, isFuture: day > input.today, shift });
      if (c.status === "On Leave") row.leaveDays++;
      if (c.status === "Absent") row.absentDays++;
      if (!clockIn && c.status !== "Absent") row.restDays++;
      if (clockIn) row.daysWorked++;
      if (c.late && clockIn) {
        row.lateDays++;
        row.minutesLate += toMinutes(clockIn) - toMinutes(shift.start_time);
      }
      if (c.missingClockOut) row.missingClockOuts++;
      if (c.hoursWorked != null) {
        const brk = input.breaks
          .filter((b) => b.employee_id === p.id && b.work_date === day && b.ended_at)
          .reduce((s, b) => s + (new Date(b.ended_at as string).getTime() - new Date(b.started_at).getTime()) / 3600000, 0);
        const net = Math.max(0, c.hoursWorked - brk);
        row.hoursWorked += net;
        const std = (toMinutes(shift.end_time) - toMinutes(shift.start_time)) / 60;
        row.overtimeHours += Math.max(0, net - (std > 0 ? std : 8));
      }
    }
    row.hoursWorked = Math.round(row.hoursWorked * 10) / 10;
    row.overtimeHours = Math.round(row.overtimeHours * 10) / 10;
    return row;
  });
}

export async function loadMonth(db: Db, orgId: string, month: string, today: string): Promise<MonthlyRow[]> {
  const days = monthDays(month, today);
  if (!days.length) return [];
  const from = days[0];
  const to = days[days.length - 1];
  const [{ data: emps }, { data: branches }] = await Promise.all([
    db.from("employees").select("id, name, staff_no, branch_id").eq("org_id", orgId).eq("status", "Active").not("branch_id", "is", null).order("name"),
    db.from("branches").select("id, name").eq("org_id", orgId),
  ]);
  const people = (emps ?? []) as { id: string; name: string; staff_no: string; branch_id: string }[];
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  const bName = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));
  const [{ data: att }, { data: brk }, { data: lv }, { data: hol }, { data: sh }] = await Promise.all([
    db.from("attendance").select("employee_id, work_date, clock_in, clock_out").in("employee_id", ids).gte("work_date", from).lte("work_date", to).limit(20000),
    db.from("attendance_breaks").select("employee_id, work_date, started_at, ended_at").in("employee_id", ids).gte("work_date", from).lte("work_date", to).limit(20000),
    db.from("leave_requests").select("employee_id, start_date, end_date").eq("status", "Approved").in("employee_id", ids).lte("start_date", to).gte("end_date", from),
    db.from("public_holidays").select("holiday_date").gte("holiday_date", from).lte("holiday_date", to),
    db.from("employee_shifts").select("employee_id, shift_patterns(start_time, end_time, grace_minutes)").in("employee_id", ids),
  ]);
  const shifts = new Map<string, Shift>();
  for (const s of sh ?? []) {
    const p = (Array.isArray(s.shift_patterns) ? s.shift_patterns[0] : s.shift_patterns) as Shift | null;
    if (p) shifts.set(s.employee_id as string, p);
  }
  return summariseMonth({
    people: people.map((p) => ({ id: p.id, name: p.name, staffNo: p.staff_no, branch: bName.get(p.branch_id) ?? "" })),
    days,
    today,
    attendance: (att ?? []) as Att[],
    breaks: (brk ?? []) as Brk[],
    leave: (lv ?? []) as Lv[],
    holidays: new Set((hol ?? []).map((h) => h.holiday_date as string)),
    shifts,
  });
}
