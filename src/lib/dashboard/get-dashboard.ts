// Dashboard 2.0 aggregator (spec §15-16). One place that resolves who is
// asking, then fans out to the other get-*.ts files in this folder in
// parallel, mirroring lib/employees/get-employee-360.ts. RLS still governs
// every query underneath this; canViewPayroll/canViewRecruitment etc. only
// decide what this layer bothers fetching and returns to the client, never
// what it trusts to keep data safe.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import { getDashboardPermissions } from "./dashboard-permissions";
import { getDashboardKpis } from "./get-kpis";
import { getActionCentre } from "./get-action-centre";
import { getWorkforceAnalytics } from "./get-workforce-analytics";
import { getPayrollSnapshot } from "./get-payroll-snapshot";
import { getAttendanceSnapshot } from "./get-attendance-snapshot";
import { getRecruitmentSnapshot } from "./get-recruitment-snapshot";
import { getRecentActivity } from "./get-recent-activity";
import type { DashboardContext, DashboardData } from "./dashboard-types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriodStr(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function getDashboardContext(
  supabase: SupabaseClient
): Promise<DashboardContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, org_id, role, employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", appUser.org_id)
    .maybeSingle();

  return {
    userId: user.id,
    orgId: appUser.org_id,
    role: appUser.role as UserRole,
    employeeId: appUser.employee_id,
    displayName: user.email?.split("@")[0] ?? "there",
    orgName: org?.name ?? "your organisation",
    today: todayStr(),
    currentPeriod: currentPeriodStr(),
  };
}

export async function getDashboard(selectedPayrollPeriod?: string): Promise<DashboardData | null> {
  const supabase = await createClient();
  const context = await getDashboardContext(supabase);
  if (!context) return null;

  const permissions = getDashboardPermissions(context.role);

  // Every other org-scoped query below filters by this id set rather than
  // trusting a hard-coded org id or relying solely on RLS (defense in
  // depth on top of, not instead of, the database policies — same pattern
  // as the Employee 360 aggregator's payroll redaction).
  const { data: orgEmployees } = await supabase
    .from("employees")
    .select("id, status")
    .eq("org_id", context.orgId);
  const orgEmployeeIds = (orgEmployees ?? []).map((e) => e.id);
  const activeEmployeeIds = (orgEmployees ?? []).filter((e) => e.status === "Active").map((e) => e.id);

  const [workforce, attendance, payroll, recruitment, actions, activity] = await Promise.all([
    getWorkforceAnalytics(supabase, context, orgEmployeeIds),
    getAttendanceSnapshot(supabase, context, activeEmployeeIds),
    permissions.canViewPayroll
      ? getPayrollSnapshot(supabase, context, selectedPayrollPeriod)
      : Promise.resolve(null),
    permissions.canViewRecruitment
      ? getRecruitmentSnapshot(supabase, context)
      : Promise.resolve(null),
    getActionCentre(supabase, context, permissions, activeEmployeeIds),
    getRecentActivity(supabase, context, permissions),
  ]);

  const kpis = getDashboardKpis({
    context,
    permissions,
    workforce,
    attendance,
    payroll,
    recruitment,
    actionsCount: actions.length,
    criticalActionsCount: actions.filter((a) => a.severity === "critical").length,
  });

  return { context, kpis, actions, workforce, payroll, attendance, recruitment, activity };
}
