import type { Shift, ClassifiedDay } from "./attendance-types";

const DEFAULT_START = "08:00";
const DEFAULT_GRACE_MINUTES = 15;
const DEFAULT_STANDARD_HOURS = 8;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function standardHoursFor(shift: Shift | undefined): number {
  if (!shift) return DEFAULT_STANDARD_HOURS;
  const mins = toMinutes(shift.end_time) - toMinutes(shift.start_time);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : DEFAULT_STANDARD_HOURS;
}

function hoursWorked(clockIn: string | null, clockOut: string | null): number | null {
  if (!clockIn || !clockOut) return null;
  const minutes = toMinutes(clockOut) - toMinutes(clockIn);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

// Attendance Status Model (spec §9) — one classification per employee/day.
// Do not classify as Absent until schedule, approved leave, holiday and
// attendance have all been considered (spec's own rule directly under the
// status table).
export function classifyDay(params: {
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  onApprovedLeave: boolean;
  isHoliday: boolean;
  isWeekend: boolean;
  isToday: boolean;
  isFuture: boolean;
  shift?: Shift;
}): ClassifiedDay {
  const { workDate, clockIn, clockOut, onApprovedLeave, isHoliday, isWeekend, isToday, isFuture, shift } = params;
  void workDate;

  if (onApprovedLeave) return { status: "On Leave", late: false, missingClockOut: false, overtimeHours: 0, hoursWorked: null };
  if (isHoliday) return { status: "Holiday", late: false, missingClockOut: false, overtimeHours: 0, hoursWorked: null };

  const expectedStart = shift ? shift.start_time : DEFAULT_START;
  const grace = shift ? shift.grace_minutes : DEFAULT_GRACE_MINUTES;
  const late = !!clockIn && toMinutes(clockIn) > toMinutes(expectedStart) + grace;
  const hours = hoursWorked(clockIn, clockOut);
  const overtimeHours = hours !== null ? Math.max(0, Math.round((hours - standardHoursFor(shift)) * 100) / 100) : 0;
  const missingClockOut = !!clockIn && !clockOut && !isToday;

  if (clockIn) {
    return { status: late ? "Late" : "Present", late, missingClockOut, overtimeHours, hoursWorked: hours };
  }

  if (isWeekend && !shift) return { status: "Off Day", late: false, missingClockOut: false, overtimeHours: 0, hoursWorked: null };
  if (isFuture || isToday) return { status: "Off Day", late: false, missingClockOut: false, overtimeHours: 0, hoursWorked: null };

  return { status: "Absent", late: false, missingClockOut: false, overtimeHours: 0, hoursWorked: null };
}
