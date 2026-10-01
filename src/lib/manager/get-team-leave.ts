// Area 06 §10 "Leave Workspace" — team calendar, upcoming leave, pending
// manager approvals, conflicts and balances, all scoped to the manager's
// direct reports. getLeaveCalendar() already relies purely on RLS to scope
// its result set (self for an employee, team for a manager, unrestricted
// for admin/hr — see that file's own comment), so no change was needed
// there; this just shapes it for the workspace and adds the balance/
// pending-approval pieces getLeaveCalendar doesn't cover.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLeaveCalendar } from "@/lib/leave/get-leave-calendar";
import { getLeaveBalances } from "@/lib/leave/get-leave-balances";
import type { LeaveRequestRow } from "@/lib/leave/leave-types";

export type TeamLeaveData = {
  upcoming: LeaveRequestRow[];
  pendingApprovals: LeaveRequestRow[];
  balances: { employeeId: string; employeeName: string; leaveType: string; remaining: number }[];
  onLeaveToday: LeaveRequestRow[];
};

export async function getTeamLeave(
  supabase: SupabaseClient,
  orgId: string,
  employeeIds: string[],
  today: string
): Promise<TeamLeaveData> {
  if (employeeIds.length === 0) return { upcoming: [], pendingApprovals: [], balances: [], onLeaveToday: [] };

  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [calendarRows, balances] = await Promise.all([
    getLeaveCalendar(supabase, today, in90Days),
    getLeaveBalances(supabase, orgId, employeeIds),
  ]);

  // getLeaveCalendar is RLS-scoped (manager sees only their team) but not
  // employeeIds-filtered in JS — intersect defensively so a scope mismatch
  // (e.g. a future broader-scope grant) can't surface someone outside the
  // resolved employeeIds set passed in by the caller.
  const scoped = calendarRows.filter((r) => employeeIds.includes(r.employee_id));

  return {
    upcoming: scoped.filter((r) => r.status === "Approved" && r.start_date >= today),
    pendingApprovals: scoped.filter((r) => r.status === "Pending"),
    onLeaveToday: scoped.filter((r) => r.status === "Approved" && r.start_date <= today && r.end_date >= today),
    balances: balances.filter((b) => b.remaining < Number.MAX_SAFE_INTEGER).map((b) => ({
      employeeId: b.employeeId,
      employeeName: b.employeeName,
      leaveType: b.leaveType,
      remaining: b.remaining,
    })),
  };
}
