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

// The app_users row (if any) for a given employee — used to notify the
// employee themselves (leave decided, document requested, etc).
export async function getEmployeeUserId(supabase: SupabaseClient, employeeId: string): Promise<string | null> {
  const { data } = await supabase.from("app_users").select("id").eq("employee_id", employeeId).maybeSingle();
  return data?.id ?? null;
}
