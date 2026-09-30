// Recent Activity (spec §23): material HR events only, each linking to its
// source record. Assembled from a handful of tables' most recent rows
// rather than a dedicated activity-log table (the app already has
// employee_audit_log for field-level changes; this is coarser and
// deliberately curated to "material" events per the spec).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, ActivityItem } from "./dashboard-types";
import type { DashboardPermissions } from "./dashboard-permissions";

export async function getRecentActivity(
  supabase: SupabaseClient,
  context: DashboardContext,
  permissions: DashboardPermissions
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  const [{ data: payrollRuns }, { data: leaveDecided }, { data: hires }, { data: vacancies }, { data: offboarded }] =
    await Promise.all([
      permissions.canViewPayroll
        ? supabase.from("payroll_runs").select("id, period, generated_at").eq("org_id", context.orgId).order("generated_at", { ascending: false }).limit(3)
        : Promise.resolve({ data: [] as { id: string; period: string; generated_at: string }[] }),
      supabase
        .from("leave_requests")
        .select("id, status, decided_on, employees(name)")
        .not("decided_on", "is", null)
        .order("decided_on", { ascending: false })
        .limit(5),
      supabase
        .from("candidates")
        .select("id, name, added_on, stage")
        .eq("stage", "Hired")
        .order("added_on", { ascending: false })
        .limit(3),
      permissions.canViewRecruitment
        ? supabase.from("requisitions").select("id, role, raised_on").eq("org_id", context.orgId).order("raised_on", { ascending: false }).limit(3)
        : Promise.resolve({ data: [] as { id: string; role: string; raised_on: string }[] }),
      permissions.canManageEmployees
        ? supabase.from("offboarding_records").select("id, employee_id, status, completed_on, employees(name)").eq("status", "Completed").order("completed_on", { ascending: false }).limit(3)
        : Promise.resolve({ data: [] as { id: string; employee_id: string; status: string; completed_on: string | null; employees: unknown }[] }),
    ]);

  for (const run of payrollRuns ?? []) {
    items.push({
      id: `payroll-${run.id}`,
      description: `Payroll ${run.period} generated`,
      href: `/dashboard/payroll`,
      occurredAt: run.generated_at,
    });
  }

  for (const lr of leaveDecided ?? []) {
    const emp = lr.employees as unknown as { name: string } | null;
    items.push({
      id: `leave-${lr.id}`,
      description: `${emp?.name ?? "An employee"}'s leave request ${(lr.status as string).toLowerCase()}`,
      href: `/dashboard/leave`,
      occurredAt: lr.decided_on as string,
    });
  }

  for (const c of hires ?? []) {
    items.push({
      id: `hire-${c.id}`,
      description: `${c.name} hired`,
      href: `/dashboard/employees`,
      occurredAt: c.added_on,
    });
  }

  for (const r of vacancies ?? []) {
    items.push({
      id: `vacancy-${r.id}`,
      description: `New vacancy posted: ${r.role}`,
      href: `/dashboard/recruitment`,
      occurredAt: r.raised_on,
    });
  }

  for (const ob of offboarded ?? []) {
    const emp = ob.employees as unknown as { name: string } | null;
    items.push({
      id: `offboard-${ob.id}`,
      description: `${emp?.name ?? "An employee"}'s offboarding completed`,
      href: `/dashboard/offboarding`,
      occurredAt: ob.completed_on ?? context.today,
    });
  }

  return items
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 8);
}
