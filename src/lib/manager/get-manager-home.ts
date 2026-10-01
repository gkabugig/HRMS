// Area 06 §20/§24 "Manager Home" — the single top-level aggregator for the
// manager workspace landing page. Resolves scope once, then fans out to
// every manager/* slice in parallel (spec §24's pseudocode pattern), mirroring
// Dashboard 2.0's get-dashboard.ts shape: one ManagerHome object the page
// renders directly, no slice re-fetched by the page itself.
//
// getManagerAlerts is deliberately called AFTER the other slices resolve
// (not in the same Promise.all) because it derives alerts from their
// results rather than re-querying — see that file's own comment.
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireManagerContext } from "./require-manager-context";
import { getManagerScope } from "./get-manager-scope";
import { getManagerTeam, type TeamRosterRow } from "./get-manager-team";
import { getTeamAttendance, type TeamAttendanceData } from "./get-team-attendance";
import { getTeamLeave, type TeamLeaveData } from "./get-team-leave";
import { getTeamPerformance, type TeamPerformanceData } from "./get-team-performance";
import { getTeamLearning, type TeamLearningData } from "./get-team-learning";
import { getManagerRecruitment, type ManagerRecruitmentData } from "./get-manager-recruitment";
import { getManagerRequests, type ManagerServiceRequest } from "./get-manager-requests";
import { getManagerAlerts, type ManagerAlert } from "./get-manager-alerts";
import { getMyTasks, type MyTask } from "@/lib/employee-portal/get-my-tasks";

export type ManagerHome = {
  managerEmployeeId: string;
  scopeTier: "organisation" | "department" | "direct_reports" | "none";
  team: TeamRosterRow[];
  tasks: MyTask[];
  attendance: TeamAttendanceData;
  leave: TeamLeaveData;
  performance: TeamPerformanceData;
  learning: TeamLearningData;
  recruitment: ManagerRecruitmentData;
  requests: ManagerServiceRequest[];
  alerts: ManagerAlert[];
};

export async function getManagerHome(supabase: SupabaseClient): Promise<ManagerHome> {
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const { employeeIds } = scope;
  const today = new Date().toISOString().slice(0, 10);

  const [team, tasks, attendance, leave, performance, learning, recruitment, requests] = await Promise.all([
    getManagerTeam(supabase, employeeIds),
    getMyTasks(supabase, ctx.userId, ctx.role),
    getTeamAttendance(supabase, employeeIds, today),
    getTeamLeave(supabase, ctx.orgId, employeeIds, today),
    getTeamPerformance(supabase, employeeIds),
    getTeamLearning(supabase, employeeIds),
    getManagerRecruitment(supabase),
    getManagerRequests(supabase, employeeIds),
  ]);

  const alerts = await getManagerAlerts(supabase, employeeIds, {
    attendance,
    leave,
    learning,
    performance,
    requests,
    recruitment,
  });

  return {
    managerEmployeeId: ctx.employeeId,
    scopeTier: scope.scopeTier,
    team,
    tasks,
    attendance,
    leave,
    performance,
    learning,
    recruitment,
    requests,
    alerts,
  };
}
