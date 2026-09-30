import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaveBalance } from "./leave-types";

// Balances (spec §3 "Entitlement, used, pending, remaining"). Reuses
// leave_policies as the entitlement source of truth (already existed) —
// "used" and "pending" are computed fresh from leave_requests for the
// current calendar year rather than tracked as a running counter, so a
// cancelled/edited request is always reflected correctly with nothing to
// keep in sync.
export async function getLeaveBalances(
  supabase: SupabaseClient,
  orgId: string,
  employeeIds: string[]
): Promise<LeaveBalance[]> {
  if (employeeIds.length === 0) return [];

  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;

  const [{ data: policies }, { data: employees }, { data: requests }] = await Promise.all([
    supabase.from("leave_policies").select("leave_type, annual_entitlement_days").eq("org_id", orgId),
    supabase.from("employees").select("id, name").in("id", employeeIds),
    supabase
      .from("leave_requests")
      .select("employee_id, leave_type, days, status")
      .in("employee_id", employeeIds)
      .in("status", ["Approved", "Pending"])
      .gte("start_date", yearStart)
      .lte("start_date", yearEnd),
  ]);

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  const balances: LeaveBalance[] = [];
  for (const policy of policies ?? []) {
    for (const empId of employeeIds) {
      const rows = (requests ?? []).filter((r) => r.employee_id === empId && r.leave_type === policy.leave_type);
      const used = rows.filter((r) => r.status === "Approved").reduce((sum, r) => sum + r.days, 0);
      const pending = rows.filter((r) => r.status === "Pending").reduce((sum, r) => sum + r.days, 0);
      balances.push({
        employeeId: empId,
        employeeName: nameById.get(empId) ?? "—",
        leaveType: policy.leave_type,
        entitlement: policy.annual_entitlement_days,
        used,
        pending,
        remaining: policy.annual_entitlement_days - used,
      });
    }
  }

  return balances;
}
