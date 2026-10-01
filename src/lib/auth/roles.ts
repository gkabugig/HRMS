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
  | "sparkles"
  | "user"
  | "check-square"
  | "help-circle";

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
  { key: "workflows", label: "Workflows", href: "/dashboard/workflows", icon: "sitemap", group: "Insights" },
  // Area 11 Workforce Risk Centre — admin/hr see the full register;
  // managers get a narrower view (manager-risk below) scoped to risks
  // concerning their own reports (workforce_risks_manager_read RLS).
  { key: "risk", label: "Workforce Risk", href: "/dashboard/risk", icon: "shield-alert", group: "Insights" },

  { key: "settings", label: "Settings", href: "/dashboard/settings", icon: "settings", group: "Admin" },
  { key: "branches", label: "Branches", href: "/dashboard/branches", icon: "building", group: "Admin" },
  // Area 09 §23 Admin Notification Centre — templates, event→policy
  // mapping, failed/dead-letter queues, suppressions, test-send, search.
  // RLS (notification_templates_hr_all etc.) restricts the actual data to
  // admin/hr regardless of nav visibility; this key just keeps it out of
  // the manager/employee sidebar.
  { key: "notifications-admin", label: "Notification Centre", href: "/dashboard/notifications/admin", icon: "settings", group: "Admin" },

  // Area 05 Employee Portal — employee-only nav pointing at /dashboard/me/*
  // instead of the shared admin/manager/hr routes above (whose module keys
  // — "leave", "attendance", "payroll", "documents" — stay pointed at
  // /dashboard/leave etc. for those roles, unchanged). A module key has one
  // href, so a role that needs a different destination for conceptually
  // the same thing gets its own key rather than overloading an existing
  // one's href per-role. "service-requests" and "notifications" are NOT
  // duplicated here — their existing destinations already ARE the
  // employee's self-service surface (confirmed self-scoped by RLS), and
  // /dashboard/me/requests + /dashboard/me/notifications simply redirect to
  // them, so the existing keys keep working for the employee role as-is.
  { key: "me-profile", label: "My Profile", href: "/dashboard/me/profile", icon: "user", group: "Overview" },
  { key: "me-attendance", label: "My Attendance", href: "/dashboard/me/attendance", icon: "clock", group: "Overview" },
  { key: "me-leave", label: "My Leave", href: "/dashboard/me/leave", icon: "calendar-days", group: "Overview" },
  { key: "me-pay", label: "My Pay", href: "/dashboard/me/pay", icon: "wallet", group: "Overview" },
  { key: "me-documents", label: "My Documents", href: "/dashboard/me/documents", icon: "folder", group: "Overview" },
  { key: "me-tasks", label: "My Tasks", href: "/dashboard/me/tasks", icon: "check-square", group: "Overview" },
  { key: "me-help", label: "Help", href: "/dashboard/me/help", icon: "help-circle", group: "Overview" },

  // Area 06 Manager Workspace — the manager's own purpose-built surface,
  // replacing the shared "attendance"/"leave"/"performance" keys for the
  // manager role (those stay pointed at /dashboard/* for admin/hr, who have
  // their own full-org version of those pages). "disciplinary" was removed
  // from the manager role entirely (see migration 0074) rather than kept
  // pointing at a page managers can no longer read anything on.
  { key: "manager-team", label: "My Team", href: "/dashboard/manager/team", icon: "users", group: "Overview" },
  // Area 09 §21 — a dedicated workspace distinct from the shared
  // "notifications" key above: that one is the manager's own personal
  // inbox (approvals/cases addressed to them); this one is the team-scoped
  // worklist (overdue team workflow tasks, open team HR cases, escalation
  // queue) that only RLS-permitted team data can populate.
  { key: "manager-notifications", label: "Team Notifications", href: "/dashboard/manager/notifications", icon: "bell", group: "Overview" },
  { key: "manager-attendance", label: "Team Attendance", href: "/dashboard/manager/attendance", icon: "clock", group: "Workforce" },
  { key: "manager-leave", label: "Team Leave", href: "/dashboard/manager/leave", icon: "calendar-days", group: "Workforce" },
  { key: "manager-performance", label: "Team Performance", href: "/dashboard/manager/performance", icon: "target", group: "Workforce" },
  { key: "manager-learning", label: "Team Learning", href: "/dashboard/manager/learning", icon: "graduation-cap", group: "Workforce" },
  { key: "manager-recruitment", label: "Recruitment", href: "/dashboard/manager/recruitment", icon: "briefcase", group: "People" },
  { key: "manager-requests", label: "Team Requests", href: "/dashboard/manager/requests", icon: "life-buoy", group: "Overview" },
  { key: "manager-analytics", label: "Team Analytics", href: "/dashboard/manager/analytics", icon: "line-chart", group: "Insights" },
  { key: "manager-organisation", label: "Organisation", href: "/dashboard/manager/organisation", icon: "sitemap", group: "People" },
];

export const DEFAULT_VISIBLE_MODULES: Record<UserRole, string[]> = {
  admin: ALL_MODULES.map((m) => m.key),
  hr: ALL_MODULES.map((m) => m.key).filter((k) => k !== "settings"),
  manager: [
    "dashboard",
    "notifications",
    "approvals",
    "service-requests",
    "manager-team",
    "manager-notifications",
    "manager-attendance",
    "manager-leave",
    "manager-performance",
    "manager-learning",
    "manager-recruitment",
    "manager-requests",
    "manager-analytics",
    "manager-organisation",
    "assignments",
    "performance-insights",
    "risk",
  ],
  employee: [
    "dashboard",
    "notifications",
    "service-requests",
    "me-profile",
    "me-attendance",
    "me-leave",
    "me-pay",
    "me-documents",
    "me-tasks",
    "me-help",
    "performance",
    "assignments",
  ],
};

// Role-specific labels for a handful of shared modules (managers/employees
// see "Team X" / "My X" instead of the HR-facing name).
export const LABEL_OVERRIDES: Partial<Record<UserRole, Record<string, string>>> = {
  manager: {
    "performance-insights": "Team Performance Insights",
    assignments: "Team Assignments",
    "service-requests": "My HR Requests",
    risk: "Team Risk",
  },
  employee: {
    dashboard: "Home",
    performance: "My Appraisals",
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
