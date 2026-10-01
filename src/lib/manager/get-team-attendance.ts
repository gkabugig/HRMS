// Area 06 §9 "Attendance Workspace" — today's present/absent/late/exception
// counts for the manager's scope, plus a 7-day trend, reusing the same
// classifyDay() status model the enterprise command centre uses (spec §27:
// "must use the same metric definitions... not create separate formulas").
// Attendance correction requests are NOT queried from
// attendance_correction_requests directly (no manager RLS policy exists on
// that table, by design — Area 05 routes it entirely through Area 02) —
// they're read via approval_steps/approval_requests, which the manager can
// already see as the named approver, matching "Submit decisions through
// the appropriate domain/approval service" (spec §9) and "do not create
// manager-specific approval tables" (spec §8).
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDay } from "@/lib/attendance/classify-day";
import type { Shift } from "@/lib/attendance/attendance-types";

export type TeamAttendanceData = {
  today: { present: number; late: number; absent: number; onLeave: number; missingClockOut: number };
  trend: { date: string; present: number; late: number; absent: number }[];
  exceptions: { employeeId: string; employeeName: string; workDate: string; type: string; detail: string }[];
  pendingCorrections: { stepId: string; requestId: string; summary: string; dueAt: string | null }[];
};

export async function getTeamAttendance(
  supabase: SupabaseClient,
  employeeIds: string[],
  today: string
): Promise<TeamAttendanceData> {
  if (employeeIds.length === 0) {
    return { today: { present: 0, late: 0, absent: 0, onLeave: 0, missingClockOut: 0 }, trend: [], exceptions: [], pendingCorrections: [] };
  }

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: records },
    { data: shiftAssignments },
    { data: approvedLeave },
    { data: holidays },
    { data: pendingSteps },
  ] = await Promise.all([
    supabase.from("employees").select("id, name").in("id", employeeIds).eq("status", "Active"),
    supabase
      .from("attendance")
      .select("employee_id, work_date, clock_in, clock_out")
      .in("employee_id", employeeIds)
      .gte("work_date", sevenDaysAgoStr)
      .lte("work_date", today),
    supabase.from("employee_shifts").select("employee_id, shift_patterns(start_time, end_time, grace_minutes)").in("employee_id", employeeIds),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .in("employee_id", employeeIds)
      .eq("status", "Approved")
      .lte("start_date", today)
      .gte("end_date", sevenDaysAgoStr),
    supabase.from("public_holidays").select("holiday_date").gte("holiday_date", sevenDaysAgoStr).lte("holiday_date", today),
    supabase
      .from("approval_steps")
      .select("id, due_at, approval_requests(id, request_type, summary)")
      .eq("status", "pending"),
  ]);

  const shiftByEmployee = new Map<string, Shift>(
    (shiftAssignments ?? [])
      .map((a) => {
        const pattern = a.shift_patterns as unknown as Shift | null;
        return pattern ? ([a.employee_id, pattern] as const) : null;
      })
      .filter((e): e is readonly [string, Shift] => e !== null)
  );
  const holidaySet = new Set((holidays ?? []).map((h) => h.holiday_date));
  const recordsByEmployeeDate = new Map((records ?? []).map((r) => [`${r.employee_id}:${r.work_date}`, r]));
  const activeEmployees = employees ?? [];

  function onLeave(employeeId: string, date: string): boolean {
    return (approvedLeave ?? []).some((l) => l.employee_id === employeeId && l.start_date <= date && l.end_date >= date);
  }

  const todayCounts = { present: 0, late: 0, absent: 0, onLeave: 0, missingClockOut: 0 };
  const trendByDate = new Map<string, { present: number; late: number; absent: number }>();
  const exceptions: TeamAttendanceData["exceptions"] = [];

  for (let d = new Date(sevenDaysAgoStr); d <= new Date(today); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = dateStr === today;
    const isFuture = dateStr > today;
    if (!trendByDate.has(dateStr)) trendByDate.set(dateStr, { present: 0, late: 0, absent: 0 });

    for (const emp of activeEmployees) {
      const record = recordsByEmployeeDate.get(`${emp.id}:${dateStr}`);
      const onLv = onLeave(emp.id, dateStr);
      const classified = classifyDay({
        workDate: dateStr,
        clockIn: record?.clock_in ?? null,
        clockOut: record?.clock_out ?? null,
        onApprovedLeave: onLv,
        isHoliday: holidaySet.has(dateStr),
        isWeekend,
        isToday,
        isFuture,
        shift: shiftByEmployee.get(emp.id),
      });

      const trendRow = trendByDate.get(dateStr)!;
      if (classified.status === "Present" || classified.status === "Late") trendRow.present++;
      if (classified.status === "Late") trendRow.late++;
      if (classified.status === "Absent") trendRow.absent++;

      if (isToday) {
        if (onLv) todayCounts.onLeave++;
        else if (classified.status === "Present") todayCounts.present++;
        else if (classified.status === "Late") {
          todayCounts.late++;
          todayCounts.present++;
        } else if (classified.status === "Absent") {
          todayCounts.absent++;
          exceptions.push({
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            type: "absent_without_leave",
            detail: "No attendance record and no approved leave on file.",
          });
        }
        if (classified.missingClockOut) {
          todayCounts.missingClockOut++;
          exceptions.push({
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            type: "missing_clock_out",
            detail: `Clocked in ${record?.clock_in} with no clock-out recorded.`,
          });
        }
        if (classified.late) {
          exceptions.push({
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            type: "late_arrival",
            detail: `Clocked in ${record?.clock_in}, scheduled ${shiftByEmployee.get(emp.id)?.start_time ?? "08:00"}.`,
          });
        }
      }
    }
  }

  const trend = [...trendByDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

  const pendingCorrections = (pendingSteps ?? [])
    .map((s) => {
      const req = (Array.isArray(s.approval_requests) ? s.approval_requests[0] : s.approval_requests) as {
        id: string;
        request_type: string;
        summary: string;
      } | null;
      return req?.request_type === "attendance_correction"
        ? { stepId: s.id, requestId: req.id, summary: req.summary, dueAt: s.due_at }
        : null;
    })
    .filter((x): x is TeamAttendanceData["pendingCorrections"][number] => x !== null);

  return { today: todayCounts, trend, exceptions, pendingCorrections };
}
