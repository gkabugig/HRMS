import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// The manager-workspace analogue of src/lib/employee-portal/require-employee-
// context.ts (Area 05) — every /dashboard/manager/* page needs the signed-in
// user's org, role and own employee_id before it can resolve a scope at all.
// Not role-gated here (a redirect, not a 403) because admin/HR may
// legitimately open the manager workspace to see what a manager sees (same
// convention as Employee 360's HR view vs self view) — scope resolution
// itself (get-manager-scope.ts) is what actually limits what comes back,
// not this guard.
export type ManagerContext = { userId: string; orgId: string; employeeId: string; role: string };

export async function requireManagerContext(supabase: SupabaseClient): Promise<ManagerContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("org_id, role, employee_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser?.employee_id) {
    redirect("/dashboard");
  }

  return { userId: user.id, orgId: appUser.org_id, employeeId: appUser.employee_id, role: appUser.role };
}
