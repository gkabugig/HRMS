export type UserRole = "admin" | "hr" | "manager" | "employee";

export type AppUser = {
  id: string;
  org_id: string;
  role: UserRole;
  employee_id: string | null;
};

export const TABS_BY_ROLE: Record<UserRole, { key: string; label: string; href: string }[]> = {
  admin: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    { key: "employees", label: "Employees", href: "/dashboard/employees" },
    { key: "recruitment", label: "Recruitment", href: "/dashboard/recruitment" },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance" },
    { key: "leave", label: "Leave", href: "/dashboard/leave" },
    { key: "payroll", label: "Payroll", href: "/dashboard/payroll" },
    { key: "performance", label: "Performance", href: "/dashboard/performance" },
    { key: "ld", label: "L&D", href: "/dashboard/ld" },
    { key: "compliance", label: "Compliance", href: "/dashboard/compliance" },
    { key: "offboarding", label: "Offboarding", href: "/dashboard/offboarding" },
    { key: "settings", label: "Settings", href: "/dashboard/settings" },
  ],
  hr: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    { key: "employees", label: "Employees", href: "/dashboard/employees" },
    { key: "recruitment", label: "Recruitment", href: "/dashboard/recruitment" },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance" },
    { key: "leave", label: "Leave", href: "/dashboard/leave" },
    { key: "payroll", label: "Payroll", href: "/dashboard/payroll" },
    { key: "performance", label: "Performance", href: "/dashboard/performance" },
    { key: "ld", label: "L&D", href: "/dashboard/ld" },
    { key: "compliance", label: "Compliance", href: "/dashboard/compliance" },
    { key: "offboarding", label: "Offboarding", href: "/dashboard/offboarding" },
  ],
  manager: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    { key: "attendance", label: "Team Attendance", href: "/dashboard/attendance" },
    { key: "leave", label: "Team Leave", href: "/dashboard/leave" },
    { key: "performance", label: "Team Performance", href: "/dashboard/performance" },
  ],
  employee: [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    { key: "leave", label: "My Leave", href: "/dashboard/leave" },
    { key: "payroll", label: "My Payslips", href: "/dashboard/payroll" },
    { key: "performance", label: "My Appraisals", href: "/dashboard/performance" },
  ],
};
