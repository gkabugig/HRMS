"use server";

// Global Search (spec Part III). Deliberately runs every category query
// through the signed-in user's own RLS-scoped Supabase session — the same
// permission boundary the underlying module pages use — rather than a
// service-role client with its own filtering, so a search result can never
// reveal a record the user couldn't already reach directly (spec §14:
// "Never expose records outside the user's permissions"; §30 security note).
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import type { GlobalSearchResponse, SearchCategory } from "./search-types";
import { searchEmployees } from "./search-employees";
import { searchPayroll } from "./search-payroll";
import { searchLeave } from "./search-leave";
import { searchAttendance } from "./search-attendance";
import { searchRecruitment } from "./search-recruitment";
import { searchDocuments } from "./search-documents";
import { searchTraining } from "./search-training";
import { STATIC_REPORTS, STATIC_ACTIONS, NAV_SHORTCUTS } from "./static-entries";

const CATEGORY_LABELS: Record<SearchCategory, string> = {
  employees: "Employees",
  payroll: "Payroll",
  leave: "Leave",
  attendance: "Attendance",
  recruitment: "Recruitment",
  documents: "Documents",
  training: "Training",
  reports: "Reports",
  actions: "Actions",
};

export async function globalSearch(query: string): Promise<GlobalSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { groups: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { groups: [] };

  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  const role = (appUser?.role ?? "employee") as UserRole;
  const isHrLike = role === "admin" || role === "hr";
  const isManagerLike = isHrLike || role === "manager";

  const [employees, payroll, leave, attendance, recruitment, documents, training] = await Promise.all([
    searchEmployees(supabase, trimmed),
    isHrLike ? searchPayroll(supabase, trimmed) : Promise.resolve([]),
    searchLeave(supabase, trimmed),
    isManagerLike ? searchAttendance(supabase, trimmed) : Promise.resolve([]),
    isHrLike ? searchRecruitment(supabase, trimmed) : Promise.resolve([]),
    searchDocuments(supabase, trimmed),
    searchTraining(supabase, trimmed),
  ]);

  const lower = trimmed.toLowerCase();
  const reports = STATIC_REPORTS.filter((r) => r.roles.includes(role) && r.label.toLowerCase().includes(lower));
  const actions = STATIC_ACTIONS.filter((a) => a.roles.includes(role) && a.label.toLowerCase().includes(lower));
  const navMatches = NAV_SHORTCUTS.filter((n) => n.roles.includes(role) && n.label.toLowerCase().includes(lower)).map((n) => ({
    id: n.id,
    label: n.label,
    sublabel: "Go to",
    href: n.href,
  }));

  const groups = [
    { category: "employees" as const, label: CATEGORY_LABELS.employees, items: employees },
    { category: "leave" as const, label: CATEGORY_LABELS.leave, items: [...leave, ...navMatches.filter((n) => n.id === "nav-leave")] },
    { category: "attendance" as const, label: CATEGORY_LABELS.attendance, items: attendance },
    { category: "payroll" as const, label: CATEGORY_LABELS.payroll, items: payroll },
    { category: "recruitment" as const, label: CATEGORY_LABELS.recruitment, items: recruitment },
    { category: "documents" as const, label: CATEGORY_LABELS.documents, items: documents },
    { category: "training" as const, label: CATEGORY_LABELS.training, items: training },
    { category: "reports" as const, label: CATEGORY_LABELS.reports, items: reports },
    { category: "actions" as const, label: CATEGORY_LABELS.actions, items: actions },
  ].filter((g) => g.items.length > 0);

  return { groups };
}

export async function getRecentActions(role: UserRole) {
  return {
    actions: STATIC_ACTIONS.filter((a) => a.roles.includes(role)),
    nav: NAV_SHORTCUTS.filter((n) => n.roles.includes(role)),
  };
}
