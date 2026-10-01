// Area 06 §15 "Team Analytics" — reuses getWorkforceAnalytics() directly
// with the manager's resolved employeeIds as orgEmployeeIds, per spec §27
// ("must use the same metric definitions... not create separate formulas").
// DashboardContext only needs `today` for this computation (tenure/turnover
// windows); the other fields are filled with the manager's own identity
// since getWorkforceAnalytics doesn't branch on role/org beyond the id list
// it's given.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkforceAnalytics } from "@/lib/dashboard/get-workforce-analytics";
import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";

export async function getManagerAnalytics(
  supabase: SupabaseClient,
  orgId: string,
  managerEmployeeId: string,
  employeeIds: string[]
): Promise<WorkforceAnalytics> {
  const today = new Date().toISOString().slice(0, 10);
  return getWorkforceAnalytics(
    supabase,
    {
      userId: managerEmployeeId,
      orgId,
      role: "manager",
      employeeId: managerEmployeeId,
      displayName: "",
      orgName: "",
      today,
      currentPeriod: today.slice(0, 7),
    },
    employeeIds
  );
}
