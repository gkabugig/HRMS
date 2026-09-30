import type { UserRole } from "@/lib/auth/roles";

export type StaticEntry = { id: string; label: string; sublabel?: string; href: string; roles: UserRole[] };

export const STATIC_REPORTS: StaticEntry[] = [
  { id: "report-payroll", label: "Payroll report", sublabel: "Reports", href: "/dashboard/reports", roles: ["admin", "hr"] },
  { id: "report-headcount", label: "Headcount report", sublabel: "Reports", href: "/dashboard/reports", roles: ["admin", "hr"] },
  { id: "report-leave", label: "Leave report", sublabel: "Reports", href: "/dashboard/reports", roles: ["admin", "hr"] },
  { id: "report-compliance", label: "Compliance report", sublabel: "Reports", href: "/dashboard/reports", roles: ["admin", "hr"] },
];

export const STATIC_ACTIONS: StaticEntry[] = [
  { id: "action-add-employee", label: "Add employee", href: "/dashboard/employees", roles: ["admin", "hr"] },
  { id: "action-run-payroll", label: "Run payroll", href: "/dashboard/payroll", roles: ["admin", "hr"] },
  { id: "action-approve-leave", label: "Approve leave", href: "/dashboard/leave?view=requests", roles: ["admin", "hr", "manager"] },
  { id: "action-request-leave", label: "Request leave", href: "/dashboard/leave", roles: ["employee", "manager", "admin", "hr"] },
  { id: "action-clock-in", label: "Clock in / out", href: "/dashboard/attendance", roles: ["employee", "manager", "admin", "hr"] },
  { id: "action-create-vacancy", label: "Create vacancy", href: "/dashboard/recruitment", roles: ["admin", "hr"] },
  { id: "action-generate-report", label: "Generate report", href: "/dashboard/reports", roles: ["admin", "hr"] },
];

export const NAV_SHORTCUTS: StaticEntry[] = [
  { id: "nav-employees", label: "Employees", href: "/dashboard/employees", roles: ["admin", "hr", "manager"] },
  { id: "nav-payroll", label: "Payroll", href: "/dashboard/payroll", roles: ["admin", "hr", "employee"] },
  { id: "nav-leave", label: "Leave requests", href: "/dashboard/leave", roles: ["admin", "hr", "manager", "employee"] },
  { id: "nav-attendance", label: "Attendance exceptions", href: "/dashboard/attendance", roles: ["admin", "hr", "manager", "employee"] },
  { id: "nav-reports", label: "Reports", href: "/dashboard/reports", roles: ["admin", "hr"] },
];
