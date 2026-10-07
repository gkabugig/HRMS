import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveConflict } from "./leave-types";

// Leave Conflict Engine (spec §5). Runs the same checks whether called
// live from the request dialog (pre-submit warnings) or after the fact —
// nothing here is UI-only.
//
// "Critical role overlap" in the spec example is "manager + designated
// deputy both away" — this schema has no deputy/backup-approver concept,
// so it's approximated as "this employee's own reporting manager is also
// away for an overlapping period", the closest real relationship on file.
export async function getLeaveConflicts(
  supabase: SupabaseClient,
  orgId: string,
  params: { employeeId: string; leaveType: string; startDate: string; endDate: string; excludeRequestId?: string }
): Promise<LeaveConflict[]> {
  const conflicts: LeaveConflict[] = [];

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, department, reporting_manager_id")
    .eq("id", params.employeeId)
    .maybeSingle();
  if (!employee) return conflicts;

  const [{ data: overlapping }, { data: holidays }, { data: settings }, { data: policy }, { data: deptEmployees }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("id, employee_id, leave_type, start_date, end_date, status, employees(name, department)")
        .in("status", ["Approved", "Pending"])
        .lte("start_date", params.endDate)
        .gte("end_date", params.startDate),
      supabase.from("public_holidays").select("holiday_date, name").eq("org_id", orgId).lte("holiday_date", params.endDate).gte("holiday_date", params.startDate),
      supabase.from("leave_calendar_settings").select("minimum_staffing_pct").eq("org_id", orgId).maybeSingle(),
      supabase.from("leave_policies").select("annual_entitlement_days").eq("org_id", orgId).eq("leave_type", params.leaveType).maybeSingle(),
      supabase.from("employees").select("id").eq("department", employee.department).eq("status", "Active"),
    ]);

  const overlapRows = (overlapping ?? []).filter((r) => r.id !== params.excludeRequestId);

  // Pending overlap: this same employee already has another request covering some of these dates.
  const ownOverlap = overlapRows.filter((r) => r.employee_id === params.employeeId);
  if (ownOverlap.length > 0) {
    conflicts.push({
      type: "pending_overlap",
      severity: "warning",
      message: "This employee already has another request overlapping these dates.",
      affectedEmployeeIds: [params.employeeId],
    });
  }

  // Team overlap: 3+ people from the same department away at once (including this request).
  const deptOverlap = overlapRows.filter((r) => {
    const emp = r.employees as unknown as { department: string } | null;
    return emp?.department === employee.department && r.employee_id !== params.employeeId;
  });
  const deptAwayIds = new Set([params.employeeId, ...deptOverlap.map((r) => r.employee_id)]);
  if (deptAwayIds.size >= 3) {
    conflicts.push({
      type: "team_overlap",
      severity: "warning",
      message: `${deptAwayIds.size} ${employee.department} team members would be away at the same time.`,
      affectedEmployeeIds: [...deptAwayIds],
    });
  }

  // Minimum staffing: department availability falls below the configured threshold.
  const deptSize = (deptEmployees ?? []).length;
  if (deptSize > 0) {
    const availablePct = Math.round(((deptSize - deptAwayIds.size) / deptSize) * 100);
    const minPct = settings?.minimum_staffing_pct ?? 70;
    if (availablePct < minPct) {
      conflicts.push({
        type: "minimum_staffing",
        severity: "warning",
        message: `${employee.department} availability would drop to ${availablePct}% (minimum ${minPct}%).`,
        affectedEmployeeIds: [...deptAwayIds],
      });
    }
  }

  // Critical role overlap: reporting manager also away.
  if (employee.reporting_manager_id) {
    const managerAway = overlapRows.some((r) => r.employee_id === employee.reporting_manager_id);
    if (managerAway) {
      conflicts.push({
        type: "critical_role_overlap",
        severity: "critical",
        message: `${employee.name}'s manager is also away for an overlapping period.`,
        affectedEmployeeIds: [params.employeeId, employee.reporting_manager_id],
      });
    }
  }

  // Holiday overlap: informational — these days are already excluded from the working-day count.
  if ((holidays ?? []).length > 0) {
    conflicts.push({
      type: "holiday_overlap",
      severity: "warning",
      message: `Includes ${holidays!.length} public holiday${holidays!.length === 1 ? "" : "s"} (${holidays!.map((h) => h.name).join(", ")}) — already excluded from the working-day count.`,
      affectedEmployeeIds: [params.employeeId],
    });
  }

  // Insufficient balance.
  if (policy) {
    const yearStart = `${new Date(params.startDate).getFullYear()}-01-01`;
    const { data: usedRows } = await supabase
      .from("leave_requests")
      .select("days")
      .eq("employee_id", params.employeeId)
      .eq("leave_type", params.leaveType)
      .eq("status", "Approved")
      .neq("id", params.excludeRequestId ?? "00000000-0000-0000-0000-000000000000")
      .gte("start_date", yearStart);
    const used = (usedRows ?? []).reduce((sum, r) => sum + r.days, 0);
    const remaining = policy.annual_entitlement_days - used;
    const requestedDays =
      Math.round((new Date(params.endDate).getTime() - new Date(params.startDate).getTime()) / 86400000) + 1;
    if (requestedDays > remaining) {
      conflicts.push({
        type: "insufficient_balance",
        severity: "critical",
        message: `This request exceeds the remaining ${params.leaveType} balance (${remaining} day${remaining === 1 ? "" : "s"} left).`,
        affectedEmployeeIds: [params.employeeId],
      });
    }
  }

  return conflicts;
}
