// Area 06 §11 "Performance Workspace" — appraisal completion, overdue
// check-ins, recent manager check-ins. appraisals/appraisal_goals are
// already manager-team-RLS-scoped (appraisals_manager_team, 0002 series) so
// this reads them directly by employeeIds; manager_checkins (migration
// 0073) is new and has its own manager-team RLS.
import type { SupabaseClient } from "@supabase/supabase-js";

export type TeamPerformanceData = {
  appraisalCompletion: { completed: number; total: number };
  overdueAppraisals: { id: string; employeeId: string; employeeName: string; cycle: string }[];
  recentCheckIns: { id: string; employeeId: string; employeeName: string; notes: string; createdAt: string }[];
};

export async function getTeamPerformance(supabase: SupabaseClient, employeeIds: string[]): Promise<TeamPerformanceData> {
  if (employeeIds.length === 0) return { appraisalCompletion: { completed: 0, total: 0 }, overdueAppraisals: [], recentCheckIns: [] };

  const [{ data: appraisals }, { data: checkIns }] = await Promise.all([
    supabase
      .from("appraisals")
      .select("id, employee_id, cycle, status, employees(name)")
      .in("employee_id", employeeIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("manager_checkins")
      .select("id, employee_id, notes, created_at, employees!manager_checkins_employee_id_fkey(name)")
      .in("employee_id", employeeIds)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const rows = (appraisals ?? []) as unknown as { id: string; employee_id: string; cycle: string; status: string; employees: { name: string } | null }[];
  const completed = rows.filter((a) => a.status === "Completed").length;
  const overdueAppraisals = rows
    .filter((a) => a.status !== "Completed")
    .map((a) => ({ id: a.id, employeeId: a.employee_id, employeeName: a.employees?.name ?? "—", cycle: a.cycle }));

  const checkInRows = (checkIns ?? []) as unknown as { id: string; employee_id: string; notes: string; created_at: string; employees: { name: string } | null }[];

  return {
    appraisalCompletion: { completed, total: rows.length },
    overdueAppraisals,
    recentCheckIns: checkInRows.map((c) => ({
      id: c.id,
      employeeId: c.employee_id,
      employeeName: c.employees?.name ?? "—",
      notes: c.notes,
      createdAt: c.created_at,
    })),
  };
}
