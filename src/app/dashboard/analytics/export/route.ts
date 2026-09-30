import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics } from "@/lib/intelligence/metrics/compute-metrics";
import { csvResponse } from "@/lib/reports";

// Export subject to permission (spec §4.3), reusing the same RLS-backed
// session the page itself renders with — no service-role bypass.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return new Response("Forbidden", { status: 403 });
  }

  const view = new URL(request.url).searchParams.get("view") ?? "executive";
  const metrics = await computeWorkforceMetrics(supabase, appUser.org_id);

  const rows: Record<string, string | number | null>[] = [
    { metric: "Active headcount", value: metrics.headcountActive.value, population: metrics.headcountActive.populationCount },
    { metric: "New hires (period)", value: metrics.headcountNewHires.value, population: metrics.headcountNewHires.populationCount },
    { metric: "Exits (period)", value: metrics.headcountExits.value, population: metrics.headcountExits.populationCount },
    { metric: "Turnover rate (%)", value: metrics.turnoverRate.value.toFixed(2), population: metrics.turnoverRate.populationCount },
    { metric: "Payroll cost gross (KES)", value: metrics.payrollCostGross.value.toFixed(2), population: metrics.payrollCostGross.populationCount },
    { metric: "Cost per employee (KES)", value: metrics.payrollCostPerEmployee.value.toFixed(2), population: metrics.payrollCostPerEmployee.populationCount },
    { metric: "Presence rate (%)", value: metrics.attendancePresenceRate.value.toFixed(2), population: metrics.attendancePresenceRate.populationCount },
    { metric: "Lateness rate (%)", value: metrics.attendanceLatenessRate.value.toFixed(2), population: metrics.attendanceLatenessRate.populationCount },
    { metric: "Leave utilisation (%)", value: metrics.leaveUtilisation.value.toFixed(2), population: metrics.leaveUtilisation.populationCount },
    { metric: "Open roles", value: metrics.recruitmentOpenRoles.value, population: metrics.recruitmentOpenRoles.populationCount },
    { metric: "Time to fill (days)", value: metrics.recruitmentTimeToFill.value.toFixed(1), population: metrics.recruitmentTimeToFill.populationCount },
    { metric: "Goal completion rate (%)", value: metrics.performanceGoalCompletion.value.toFixed(2), population: metrics.performanceGoalCompletion.populationCount },
    { metric: "Appraisal completion rate (%)", value: metrics.performanceAppraisalCompletion.value.toFixed(2), population: metrics.performanceAppraisalCompletion.populationCount },
    { metric: "Training completion rate (%)", value: metrics.learningCompletionRate.value.toFixed(2), population: metrics.learningCompletionRate.populationCount },
    { metric: "Expiring compliance documents", value: metrics.complianceExpiringDocuments.value, population: metrics.complianceExpiringDocuments.populationCount },
  ];

  return csvResponse(`workforce-analytics-${view}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}
