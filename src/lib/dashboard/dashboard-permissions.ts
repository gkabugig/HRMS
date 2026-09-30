// Role-aware widget/KPI composition for Dashboard 2.0 (spec §11, §19).
// This is a display-composition helper only — it decides which widgets a
// role's dashboard *shows* and which fields an aggregator is allowed to
// fetch/redact. It is never the security boundary by itself: RLS (policies
// in supabase/migrations) enforces row access underneath every query here,
// exactly as in lib/employees/get-employee-360.ts.
import type { UserRole } from "@/lib/auth/roles";

export type DashboardPermissions = {
  role: UserRole;
  canViewPayroll: boolean; // aggregate payroll cost figures
  canViewIndividualSalary: boolean;
  canViewRecruitment: boolean;
  canViewWorkforceAnalytics: boolean;
  canViewOrgWideAttendance: boolean; // vs. own-only
  canApproveLeave: boolean;
  canRunPayroll: boolean;
  canManageEmployees: boolean;
};

export function getDashboardPermissions(role: UserRole): DashboardPermissions {
  switch (role) {
    case "admin":
      return {
        role,
        canViewPayroll: true,
        canViewIndividualSalary: true,
        canViewRecruitment: true,
        canViewWorkforceAnalytics: true,
        canViewOrgWideAttendance: true,
        canApproveLeave: true,
        canRunPayroll: true,
        canManageEmployees: true,
      };
    case "hr":
      return {
        role,
        canViewPayroll: true,
        canViewIndividualSalary: true,
        canViewRecruitment: true,
        canViewWorkforceAnalytics: true,
        canViewOrgWideAttendance: true,
        canApproveLeave: true,
        canRunPayroll: true,
        canManageEmployees: true,
      };
    case "manager":
      return {
        role,
        canViewPayroll: false,
        canViewIndividualSalary: false,
        canViewRecruitment: false,
        canViewWorkforceAnalytics: true,
        canViewOrgWideAttendance: false, // RLS scopes attendance queries to their team
        canApproveLeave: true,
        canRunPayroll: false,
        canManageEmployees: false,
      };
    case "employee":
    default:
      return {
        role,
        // Their own payslips already live under the Payroll module ("My
        // Payslips"); the dashboard's Payroll Snapshot card is an org-wide
        // cost widget, not appropriate here.
        canViewPayroll: false,
        canViewIndividualSalary: false,
        canViewRecruitment: false,
        canViewWorkforceAnalytics: false,
        canViewOrgWideAttendance: false,
        canApproveLeave: false,
        canRunPayroll: false,
        canManageEmployees: false,
      };
  }
}

// Which KPI ids appear for a role, and in what order (spec §4: "Use a
// role-specific 4-6 card set").
export function kpiOrderForRole(role: UserRole): string[] {
  switch (role) {
    case "admin":
    case "hr":
      return ["headcount", "present-today", "on-leave", "needs-attention", "payroll-cost", "open-positions"];
    case "manager":
      return ["team-headcount", "present-today", "on-leave", "needs-attention"];
    case "employee":
    default:
      return ["my-attendance", "my-leave-balance", "needs-attention"];
  }
}
