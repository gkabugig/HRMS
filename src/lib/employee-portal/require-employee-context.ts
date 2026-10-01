import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

// Every /dashboard/me/* page needs the same four things before it can query
// anything: the signed-in user, their org, their role, and — critically —
// their own employee_id, since every self-scoped read/write in this portal
// is keyed on it. Centralised here instead of repeated per page (ten pages
// would otherwise each hand-roll this exact lookup).
export type EmployeeContext = { userId: string; orgId: string; employeeId: string; role: string };

export async function requireEmployeeContext(supabase: SupabaseClient): Promise<EmployeeContext> {
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
    // No employee record linked — nothing in the portal can resolve. Same
    // "account not yet set up" situation src/app/dashboard/page.tsx handles
    // for getDashboard() returning null.
    redirect("/dashboard");
  }

  return { userId: user.id, orgId: appUser.org_id, employeeId: appUser.employee_id, role: appUser.role };
}
