import type { SupabaseClient } from "@supabase/supabase-js";
import { getDirectReports } from "@/lib/organisation/get-direct-reports";

// Area 06 §23 "Manager Scope Resolver" — the one place every manager-
// workspace query asks "which employee ids may I see". Resolves the SAME
// way user_can_access_employee() does server-side (0037): ask
// rbac_granted_scopes('employees','view',...) which scope tier the acting
// user's role actually holds, then expand that tier to a concrete employee
// id list. This mirrors the RLS resolver deliberately — a manager-workspace
// page that asked a DIFFERENT question than what RLS enforces could end up
// either showing rows RLS then silently drops (confusing partial pages) or,
// worse, believing it scoped correctly when RLS actually scopes wider or
// narrower.
//
// Per spec §6: "Default scope should be direct reports. Broader
// team/department/business-unit scope must be explicitly granted through
// Area 01 and must not be inferred merely because a user has the manager
// role." No org in this codebase grants anything broader than
// direct_reports today (confirmed: department/business_unit/team are
// unreachable in the current rbac_permissions seed), so in practice this
// always resolves to direct reports — but it is written to honor a wider
// grant if one is ever configured, rather than hard-coding direct_reports
// as the only possible outcome.
export type ManagerScope = {
  managerEmployeeId: string;
  scopeTier: "organisation" | "department" | "direct_reports" | "none";
  employeeIds: string[];
};

export async function getManagerScope(
  supabase: SupabaseClient,
  managerEmployeeId: string,
  orgId: string
): Promise<ManagerScope> {
  // rbac_granted_scopes_array (0072) is a text[]-returning wrapper around
  // rbac_granted_scopes() (which itself returns `setof rbac_scope`, kept
  // as-is for its existing SQL-side callers in 0037's resolvers) — a plain
  // array return serializes over PostgREST as an unambiguous JSON string
  // array, unlike a scalar setof's RPC JSON shape.
  const { data: scopesData, error } = await supabase.rpc("rbac_granted_scopes_array", {
    p_resource: "employees",
    p_action: "view",
    p_sensitivity: "normal",
  });
  if (error) throw new Error(error.message);
  const scopes = new Set((scopesData as string[] | null) ?? []);

  if (scopes.has("organisation")) {
    const { data } = await supabase.from("employees").select("id").eq("org_id", orgId);
    return { managerEmployeeId, scopeTier: "organisation", employeeIds: (data ?? []).map((e) => e.id) };
  }

  if (scopes.has("department")) {
    const { data: self } = await supabase.from("employees").select("department").eq("id", managerEmployeeId).maybeSingle();
    if (self?.department) {
      const { data } = await supabase.from("employees").select("id").eq("org_id", orgId).eq("department", self.department);
      return { managerEmployeeId, scopeTier: "department", employeeIds: (data ?? []).map((e) => e.id) };
    }
  }

  if (scopes.has("direct_reports")) {
    const employeeIds = await getDirectReports(supabase, managerEmployeeId);
    return { managerEmployeeId, scopeTier: "direct_reports", employeeIds };
  }

  return { managerEmployeeId, scopeTier: "none", employeeIds: [] };
}
