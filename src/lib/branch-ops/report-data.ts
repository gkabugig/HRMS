// Read-side helpers for the branch report. Deliberately NOT a "use server"
// module: these take a context argument and must never be callable from a
// browser as a server action.
import { createAdminClient } from "@/lib/supabase/admin";
import type { Ctx, Db } from "@/lib/hub/context";
import { nairobiNow } from "@/lib/attendance/nairobi-time";

export type RunBranch = { id: string; name: string; role: "manager" | "deputy" };

// Branches the signed-in person runs (as manager or deputy).
export async function branchesRunBy(c: Ctx): Promise<RunBranch[]> {
  if (!c.employeeId) return [];
  const db = createAdminClient() as Db;
  const { data } = await db
    .from("branches")
    .select("id, name, manager_employee_id, deputy_employee_id")
    .eq("org_id", c.orgId)
    .or(`manager_employee_id.eq.${c.employeeId},deputy_employee_id.eq.${c.employeeId}`)
    .order("name");
  return (data ?? []).map((b) => ({ id: b.id, name: b.name, role: b.manager_employee_id === c.employeeId ? "manager" : "deputy" }));
}

// Managers report on today, or yesterday if they missed it.
export async function allowedReportDates(): Promise<string[]> {
  const { date } = nairobiNow();
  const y = new Date(`${date}T12:00:00+03:00`);
  y.setDate(y.getDate() - 1);
  return [date, y.toISOString().slice(0, 10)];
}

