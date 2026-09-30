export type UserRole = "admin" | "hr" | "manager" | "employee";

export type AppUser = {
  id: string;
  org_id: string;
  role: UserRole;
  employee_id: string | null;
};

export type NavIcon =
  | "layout-dashboard"
  | "users"
  | "briefcase"
  | "clock"
  | "calendar-days"
  | "wallet"
  | "target"
  | "graduation-cap"
  | "shield-check"
  | "gavel"
  | "log-out"
  | "settings"
  | "bar-chart";

export type NavTab = { key: string; label: string; href: string; icon: NavIcon };

export const TABS_BY_ROLE: Record<UserRole, NavTab[]> = {
  admin: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
    { key: "employees", label: "Employees", href: "/dashboard/employees", icon: "users" },
    { key: "recruitment", label: "Recruitment", href: "/dashboard/recruitment", icon: "briefcase" },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: "clock" },
    { key: "leave", label: "Leave", href: "/dashboard/leave", icon: "calendar-days" },
    { key: "payroll", label: "Payroll", href: "/dashboard/payroll", icon: "wallet" },
    { key: "performance", label: "Performance", href: "/dashboard/performance", icon: "target" },
    { key: "ld", label: "L&D", href: "/dashboard/ld", icon: "graduation-cap" },
    { key: "compliance", label: "Compliance", href: "/dashboard/compliance", icon: "shield-check" },
    { key: "disciplinary", label: "Disciplinary", href: "/dashboard/disciplinary", icon: "gavel" },
    { key: "offboarding", label: "Offboarding", href: "/dashboard/offboarding", icon: "log-out" },
    { key: "reports", label: "Reports", href: "/dashboard/reports", icon: "bar-chart" },
    { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "settings" },
  ],
  hr: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
    { key: "employees", label: "Employees", href: "/dashboard/employees", icon: "users" },
    { key: "recruitment", label: "Recruitment", href: "/dashboard/recruitment", icon: "briefcase" },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: "clock" },
    { key: "leave", label: "Leave", href: "/dashboard/leave", icon: "calendar-days" },
    { key: "payroll", label: "Payroll", href: "/dashboard/payroll", icon: "wallet" },
    { key: "performance", label: "Performance", href: "/dashboard/performance", icon: "target" },
    { key: "ld", label: "L&D", href: "/dashboard/ld", icon: "graduation-cap" },
    { key: "compliance", label: "Compliance", href: "/dashboard/compliance", icon: "shield-check" },
    { key: "disciplinary", label: "Disciplinary", href: "/dashboard/disciplinary", icon: "gavel" },
    { key: "offboarding", label: "Offboarding", href: "/dashboard/offboarding", icon: "log-out" },
    { key: "reports", label: "Reports", href: "/dashboard/reports", icon: "bar-chart" },
  ],
  manager: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
    { key: "attendance", label: "Team Attendance", href: "/dashboard/attendance", icon: "clock" },
    { key: "leave", label: "Team Leave", href: "/dashboard/leave", icon: "calendar-days" },
    { key: "performance", label: "Team Performance", href: "/dashboard/performance", icon: "target" },
    { key: "disciplinary", label: "Team Disciplinary", href: "/dashboard/disciplinary", icon: "gavel" },
  ],
  employee: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
    { key: "leave", label: "My Leave", href: "/dashboard/leave", icon: "calendar-days" },
    { key: "payroll", label: "My Payslips", href: "/dashboard/payroll", icon: "wallet" },
    { key: "performance", label: "My Appraisals", href: "/dashboard/performance", icon: "target" },
  ],
};
