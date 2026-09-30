import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDay } from "./classify-day";
import type { AttendanceKpis, AttendanceException, Shift } from "./attendance-types";

export type CommandCentreData = {
  kpis: AttendanceKpis;
  exceptions: AttendanceException[];
  trend: { date: string; present: number; late: number; absent: number }[];
  departmentBreakdown: { department: string; presentPct: number; headcount: number }[];
};

// Aggregates server-side rather than shipping raw attendance rows to the
// browser (spec §34). Everything here is scoped by whatever the caller's
// RLS session already permits — employees (for the expected roster) and
// attendance (for actual records) use the same admin/hr-full,
// manager-team, self-only policies as the rest of the app.
export async function getAttendanceCommandCentre(
  supabase: SupabaseClient,
  today: string
): Promise<CommandCentreData> {
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const [{ data: employees }, { data: records }, { data: shiftAssignments }, { data: approvedLeave }, { data: holidays }] =
    await Promise.all([
      supabase.from("employees").select("id, name, department").eq("status", "Active"),
      supabase
        .from("attendance")
        .select("id, employee_id, work_date, clock_in, clock_out, employees(name, department)")
        .gte("work_date", sevenDaysAgoStr)
        .lte("work_date", today),
      supabase.from("employee_shifts").select("employee_id, shift_patterns(start_time, end_time, grace_minutes)"),
      supabase
        .from("leave_requests")
        .select("employee_id, start_date, end_date")
        .eq("status", "Approved")
        .lte("start_date", today)
        .gte("end_date", sevenDaysAgoStr),
      supabase.from("public_holidays").select("holiday_date").gte("holiday_date", sevenDaysAgoStr).lte("holiday_date", today),
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

  function onLeave(employeeId: string, date: string): boolean {
    return (approvedLeave ?? []).some((l) => l.employee_id === employeeId && l.start_date <= date && l.end_date >= date);
  }

  const exceptions: AttendanceException[] = [];
  const kpis: AttendanceKpis = { present: 0, late: 0, absent: 0, missingClockOut: 0, overtimeHours: 0 };
  const trendByDate = new Map<string, { present: number; late: number; absent: number }>();
  const deptTotals = new Map<string, { present: number; total: number }>();

  const activeEmployees = employees ?? [];

  for (const emp of activeEmployees) {
    if (!deptTotals.has(emp.department)) deptTotals.set(emp.department, { present: 0, total: 0 });
  }

  for (let d = new Date(sevenDaysAgoStr); d <= new Date(today); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = dateStr === today;
    const isFuture = dateStr > today;
    if (!trendByDate.has(dateStr)) trendByDate.set(dateStr, { present: 0, late: 0, absent: 0 });

    for (const emp of activeEmployees) {
      const record = recordsByEmployeeDate.get(`${emp.id}:${dateStr}`);
      const classified = classifyDay({
        workDate: dateStr,
        clockIn: record?.clock_in ?? null,
        clockOut: record?.clock_out ?? null,
        onApprovedLeave: onLeave(emp.id, dateStr),
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
        if (classified.status === "Present") kpis.present++;
        if (classified.status === "Late") {
          kpis.late++;
          kpis.present++;
        }
        if (classified.status === "Absent") kpis.absent++;
        if (classified.missingClockOut) kpis.missingClockOut++;
        kpis.overtimeHours += classified.overtimeHours;

        const dept = deptTotals.get(emp.department)!;
        dept.total++;
        if (classified.status === "Present" || classified.status === "Late") dept.present++;

        if (classified.late) {
          exceptions.push({
            id: `late-${emp.id}-${dateStr}`,
            type: "late_arrival",
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            detail: `Clocked in ${record?.clock_in}, scheduled ${shiftByEmployee.get(emp.id)?.start_time ?? "08:00"}.`,
          });
        }
        if (classified.overtimeHours > 0) {
          exceptions.push({
            id: `overtime-${emp.id}-${dateStr}`,
            type: "overtime",
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            detail: `${classified.overtimeHours}h beyond scheduled hours.`,
          });
        }
        if (classified.status === "Absent") {
          exceptions.push({
            id: `absent-${emp.id}-${dateStr}`,
            type: "absent_without_leave",
            employeeId: emp.id,
            employeeName: emp.name,
            workDate: dateStr,
            detail: "No attendance record and no approved leave on file.",
          });
        }
      }
      if (classified.missingClockOut) {
        exceptions.push({
          id: `missing-${emp.id}-${dateStr}`,
          type: "missing_clock_out",
          employeeId: emp.id,
          employeeName: emp.name,
          workDate: dateStr,
          detail: `Clocked in ${record?.clock_in} on ${dateStr} with no clock-out recorded.`,
        });
      }
    }
  }

  // Employment Act s.27: at least one rest day in every 7. Flags any run of
  // 7+ consecutive calendar days with a clock-in and no gap, per employee,
  // over the 7-day window already loaded above (so this only catches a
  // streak that exactly fills the window — the same approximation the
  // original single-page attendance view used).
  const clockInDatesByEmployee = new Map<string, string[]>();
  for (const r of records ?? []) {
    if (!r.clock_in) continue;
    if (!clockInDatesByEmployee.has(r.employee_id)) clockInDatesByEmployee.set(r.employee_id, []);
    clockInDatesByEmployee.get(r.employee_id)!.push(r.work_date);
  }
  for (const [employeeId, dates] of clockInDatesByEmployee) {
    const sorted = [...new Set(dates)].sort();
    let streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const dayGap = Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000);
      streak = dayGap === 1 ? streak + 1 : 1;
      if (streak >= 7) {
        const emp = activeEmployees.find((e) => e.id === employeeId);
        exceptions.push({
          id: `restday-${employeeId}`,
          type: "schedule_mismatch",
          employeeId,
          employeeName: emp?.name ?? "An employee",
          workDate: sorted[i],
          detail: "Worked 7+ consecutive days with no rest day — Employment Act s.27 requires at least one per 7.",
        });
        break;
      }
    }
  }

  const departmentBreakdown = [...deptTotals.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([department, v]) => ({ department, presentPct: Math.round((v.present / v.total) * 100), headcount: v.total }))
    .sort((a, b) => b.presentPct - a.presentPct);

  const trend = [...trendByDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

  // Dedupe (a missing-clock-out exception from an earlier day in the
  // 7-day window could otherwise appear once per day it's still open).
  const seenExceptionIds = new Set<string>();
  const dedupedExceptions = exceptions.filter((e) => (seenExceptionIds.has(e.id) ? false : (seenExceptionIds.add(e.id), true)));

  return { kpis, exceptions: dedupedExceptions, trend, departmentBreakdown };
}
