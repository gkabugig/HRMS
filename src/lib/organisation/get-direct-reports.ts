import type { SupabaseClient } from "@supabase/supabase-js";

// Area 06 — the mirror of getCurrentManager (get-current-manager.ts):
// resolves a manager's CURRENT direct reports from the same authoritative,
// effective-dated reporting_relationships source (get_direct_reports(),
// supabase/migrations/0071), never employees.reporting_manager_id. This is
// the one place the Manager Workspace asks "who are my reports" as a set —
// every manager-scoped list/aggregate in src/lib/manager/* calls this (via
// getManagerScope) rather than re-deriving it.
export async function getDirectReports(
  supabase: SupabaseClient,
  managerEmployeeId: string,
  asOf: Date = new Date()
): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_direct_reports", {
    p_manager_employee_id: managerEmployeeId,
    p_as_of: asOf.toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return ((data as { employee_id: string }[] | null) ?? []).map((r) => r.employee_id);
}
