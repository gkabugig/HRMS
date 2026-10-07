import type { SupabaseClient } from "@supabase/supabase-js";
import { getHrManagerUserIds } from "../approvals/head-of-organisation";

// Resolves who should be notified about something happening to a given
// employee: HR/admin always, plus that employee's direct manager's app
// account if one exists and is itself linked to a login. Used for leave
// submitted, attendance exceptions, compliance/contract reminders, etc.
export async function getHrAndManagerRecipients(
  supabase: SupabaseClient,
  orgId: string,
  employeeId: string
): Promise<string[]> {
  const [{ data: hrUsers }, { data: employee }, { data: self }] = await Promise.all([
    supabase.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]),
    supabase.from("employees").select("reporting_manager_id, is_head_of_organisation").eq("id", employeeId).maybeSingle(),
    supabase.from("app_users").select("id").eq("employee_id", employeeId).maybeSingle(),
  ]);

  // The head of the organisation has no manager: her requests go to the HR
  // Manager only. Nobody is ever notified to approve their own request.
  if (employee?.is_head_of_organisation) {
    const hrManagers = await getHrManagerUserIds(supabase, orgId);
    return hrManagers.filter((id) => id !== self?.id);
  }

  const ids = new Set((hrUsers ?? []).map((u) => u.id as string));
  if (self?.id) ids.delete(self.id);

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
    .select("reporting_manager_id, org_id, is_head_of_organisation")
    .eq("id", employeeId)
    .maybeSingle();
  if (employee?.is_head_of_organisation) return getHrManagerUserIds(supabase, employee.org_id as string);
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
