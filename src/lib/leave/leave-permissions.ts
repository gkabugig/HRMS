import type { UserRole } from "@/lib/auth/roles";
import type { LeaveView } from "./leave-types";

// Which of the five calendar views (spec §3 table) a role may open. RLS on
// leave_requests still governs what rows actually come back within each
// view — this only decides which tabs are worth showing.
export function availableLeaveViews(role: UserRole): LeaveView[] {
  if (role === "admin" || role === "hr") return ["my", "team", "company", "requests", "balances"];
  if (role === "manager") return ["my", "team", "requests", "balances"];
  // Employees get "Requests" too (RLS scopes it to their own rows) so they
  // have somewhere to see status and cancel a still-pending one (spec §25).
  return ["my", "requests", "balances"];
}

export function defaultLeaveView(role: UserRole): LeaveView {
  return availableLeaveViews(role)[0];
}

export function canApproveLeave(role: UserRole): boolean {
  return role === "admin" || role === "hr" || role === "manager";
}
