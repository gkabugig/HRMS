export type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: "Pending" | "Approved" | "Rejected";
  applied_on: string;
  decided_on: string | null;
  edit_count?: number | null;
  employees: { name: string; department: string; reporting_manager_id: string | null } | null;
};

export type LeaveBalance = {
  employeeId: string;
  employeeName: string;
  leaveType: string;
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
};

export type LeaveConflictType =
  | "team_overlap"
  | "critical_role_overlap"
  | "minimum_staffing"
  | "insufficient_balance"
  | "holiday_overlap"
  | "pending_overlap";

export type LeaveConflict = {
  type: LeaveConflictType;
  severity: "warning" | "critical";
  message: string;
  affectedEmployeeIds: string[];
};

export type LeaveView = "my" | "team" | "company" | "requests" | "balances";
