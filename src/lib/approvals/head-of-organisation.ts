import type { SupabaseClient } from "@supabase/supabase-js";

// The head of the organisation (CEO) has no reporting manager, so her
// requests are approved by the HR Manager (role "hr"). Everyone else —
// including the HR Manager — follows the normal line-manager course.
export async function isHeadOfOrganisation(supabase: SupabaseClient, employeeId: string): Promise<boolean> {
  const { data } = await supabase
    .from("employees")
    .select("is_head_of_organisation")
    .eq("id", employeeId)
    .maybeSingle();
  return data?.is_head_of_organisation === true;
}

// app_users ids holding the HR role in the org (the head's approvers).
export async function getHrManagerUserIds(supabase: SupabaseClient, orgId: string): Promise<string[]> {
  const { data } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", "hr");
  return (data ?? []).map((u) => u.id as string);
}
