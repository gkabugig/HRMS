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
  | "bar-chart"
  | "sitemap"
  | "folder"
  | "building"
  | "calendar-clock"
  | "clipboard-list"
  | "history"
  | "bell"
  | "check-circle"
  | "life-buoy"
  | "line-chart"
  | "shield-alert"
  | "sparkles";

export type NavGroup = "Overview" | "People" | "Workforce" | "Payroll & Compliance" | "Insights" | "Admin";

export type NavTab = {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  group: NavGroup;
};

// The full catalog of modules the app can show in the sidebar. Per-role
// visibility is normally decided at request time from the
// role_module_permissions table (see dashboard/layout.tsx) so an admin can
// tune it from Settings; DEFAULT_VISIBLE_MODULES below is only the fallback
// used if that table has no rows yet for an org (fresh install) or the
// fetch fails, and mirrors the seed in
// supabase/migrations/0014_role_module_permissions.sql exactly.
export const ALL_MODULES: NavTab[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", group: "Overview" },
  { key: "notifications", label: "Notifications", href: "/dashboard/notifications", icon: "bell", group: "Overview" },
  { key: "approvals", label: "My Approvals", href: "/dashboard/approvals", icon: "check-circle", group: "Overview" },
  { key: "service-requests", label: "HR Service Centre", href: "/dashboard/service-requests", icon: "life-buoy", group: "Overview" },

  { key: "employees", label: "Employees", href: "/dashboard/employees", icon: "users", group: "People" },
  { key: "recruitment", label: "Recruitment", href: "/dashboard/recruitment", icon: "briefcase", group: "People" },
  { key: "organogram", label: "Organogram", href: "/dashboard/organogram", icon: "sitemap", group: "People" },
  { key: "offboarding", label: "Offboarding", href: "/dashboard/offboarding", icon: "log-out", group: "People" },

  { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: "clock", group: "Workforce" },
  { key: "leave", label: "Leave", href: "/dashboard/leave", icon: "calendar-days", group: "Workforce" },
  { key: "assignments", label: "Assignments", href: "/dashboard/assignments", icon: "clipboard-list", group: "Workforce" },
  { key: "performance", label: "Performance", href: "/dashboard/performance", icon: "target", group: "Workforce" },
  { key: "ld", label: "L&D", href: "/dashboard/ld", icon: "graduation-cap", group: "Workforce" },
  { key: "shifts", label: "Shifts", href: "/dashboard/shifts", icon: "calendar-clock", group: "Workforce" },

  { key: "payroll", label: "Payroll", href: "/dashboard/payroll", icon: "wallet", group: "Payroll & Compliance" },
  { key: "compliance", label: "Compliance", href: "/dashboard/compliance", icon: "shield-check", group: "Payroll & Compliance" },
  { key: "disciplinary", label: "Disciplinary", href: "/dashboard/disciplinary", icon: "gavel", group: "Payroll & Compliance" },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: "folder", group: "Payroll & Compliance" },

  { key: "reports", label: "Reports", href: "/dashboard/reports", icon: "bar-chart", group: "Insights" },
  { key: "analytics", label: "Workforce Analytics", href: "/dashboard/analytics", icon: "line-chart", group: "Insights" },
  { key: "payroll-anomalies", label: "Payroll Intelligence", href: "/dashboard/payroll/anomalies", icon: "shield-alert", group: "Insights" },
  { key: "performance-insights", label: "Performance Insights", href: "/dashboard/performance/insights", icon: "sparkles", group: "Insights" },
  { key: "audit-log", label: "Audit Centre", href: "/dashboard/audit-log", icon: "history", group: "Insights" },

  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "settings", group: "Admin" },
  { key: "branches", label: "Branches", href: "/dashboard/branches", icon: "building", group: "Admin" },
];

export const DEFAULT_VISIBLE_MODULES: Record<UserRole, string[]> = {
  admin: ALL_MODULES.map((m) => m.key),
  hr: ALL_MODULES.map((m) => m.key).filter((k) => k !== "settings"),
  manager: ["dashboard", "notifications", "approvals", "service-requests", "attendance", "leave", "assignments", "performance", "performance-insights", "disciplinary"],
  employee: ["dashboard", "notifications", "service-requests", "leave", "payroll", "performance", "documents", "assignments"],
};

// Role-specific labels for a handful of shared modules (managers/employees
// see "Team X" / "My X" instead of the HR-facing name).
export const LABEL_OVERRIDES: Partial<Record<UserRole, Record<string, string>>> = {
  manager: {
    attendance: "Team Attendance",
    leave: "Team Leave",
    performance: "Team Performance",
    "performance-insights": "Team Performance Insights",
    disciplinary: "Team Disciplinary",
    assignments: "Team Assignments",
    "service-requests": "My HR Requests",
  },
  employee: {
    leave: "My Leave",
    payroll: "My Payslips",
    performance: "My Appraisals",
    documents: "My Documents",
    assignments: "My Assignments",
    "service-requests": "My HR Requests",
  },
};

export function tabsForRole(role: UserRole, visibleModuleKeys: Set<string>): NavTab[] {
  const overrides = LABEL_OVERRIDES[role] ?? {};
  return ALL_MODULES.filter((m) => visibleModuleKeys.has(m.key)).map((m) =>
    overrides[m.key] ? { ...m, label: overrides[m.key] } : m
  );
}
