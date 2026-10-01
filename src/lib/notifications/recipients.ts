import type { SupabaseClient } from "@supabase/supabase-js";

// Resolves who should be notified about something happening to a given
// employee: HR/admin always, plus that employee's direct manager's app
// account if one exists and is itself linked to a login. Used for leave
// submitted, attendance exceptions, compliance/contract reminders, etc.
export async function getHrAndManagerRecipients(
  supabase: SupabaseClient,
  orgId: string,
  employeeId: string
): Promise<string[]> {
  const [{ data: hrUsers }, { data: employee }] = await Promise.all([
    supabase.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]),
    supabase.from("employees").select("reporting_manager_id").eq("id", employeeId).maybeSingle(),
  ]);

  const ids = new Set((hrUsers ?? []).map((u) => u.id as string));

  if (employee?.reporting_manager_id) {
    const { data: managerUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("employee_id", employee.reporting_manager_id)
      .maybeSingle();
    if (managerUser) ids.add(managerUser.id as string);
  }

  return [...ids];
}

// Just the employee's direct manager's app account, if any — no HR/admin.
// Used where HR is already being notified through a separate channel (e.g.
// the Universal Approval Engine's own approval.step_assigned notification)
// and a second, duplicate HR notification for the same event would be
// noise; the manager still isn't part of that approval chain, so they still
// need their own heads-up.
export async function getManagerRecipient(
  supabase: SupabaseClient,
  employeeId: string
): Promise<string[]> {
  const { data: employee } = await supabase
    .from("employees")
    .select("reporting_manager_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee?.reporting_manager_id) return [];

  const { data: managerUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("employee_id", employee.reporting_manager_id)
    .maybeSingle();
  return managerUser ? [managerUser.id as string] : [];
}

// The app_users row (if any) for a given employee — used to notify the
// employee themselves (leave decided, document requested, etc).
export async function getEmployeeUserId(supabase: SupabaseClient, employeeId: string): Promise<string | null> {
  const { data } = await supabase.from("app_users").select("id").eq("employee_id", employeeId).maybeSingle();
  return data?.id ?? null;
}
