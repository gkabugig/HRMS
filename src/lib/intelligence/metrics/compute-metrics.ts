import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComputedMetric, MetricDefinition, SegmentBreakdown, TrendPoint } from "./metric-types";

// Computes the canonical KPI set behind the Workforce Analytics dashboards
// (spec §4.1) on demand, straight from the operational tables every other
// module already writes to — never a second copy of employee/payroll/
// performance data (build non-negotiable: no duplicate concepts). Values
// are then opportunistically written to metric_snapshots so a trend line
// accumulates over time (this app has no background job runner; the same
// "compute when viewed" pattern is used for the notification reminder
// sweep in lib/notifications/notification-rules.ts).

export type WorkforceMetrics = {
  headcountActive: ComputedMetric;
  headcountNewHires: ComputedMetric;
  headcountExits: ComputedMetric;
  turnoverRate: ComputedMetric;
  payrollCostGross: ComputedMetric;
  payrollCostPerEmployee: ComputedMetric;
  attendancePresenceRate: ComputedMetric;
  attendanceLatenessRate: ComputedMetric;
  leaveUtilisation: ComputedMetric;
  recruitmentOpenRoles: ComputedMetric;
  recruitmentTimeToFill: ComputedMetric;
  performanceGoalCompletion: ComputedMetric;
  performanceAppraisalCompletion: ComputedMetric;
  learningCompletionRate: ComputedMetric;
  complianceExpiringDocuments: ComputedMetric;
  // Area 10 §5.3 additions.
  fte: ComputedMetric;
  vacancyRate: ComputedMetric;
  overtimeHours: ComputedMetric;
  approvalAgeing: ComputedMetric;
  caseSlaCompliance: ComputedMetric;
  // Area 10 extension once Areas 16/17 existed (spec §5.11).
  workforcePlanVariance: ComputedMetric;
  compensationBudgetVariance: ComputedMetric;
  headcountByDepartment: SegmentBreakdown[];
  costByDepartment: SegmentBreakdown[];
  presenceByDepartment: SegmentBreakdown[];
  computedAt: string;
};

function withDef(key: string, value: number, populationCount: number | null, defs: Map<string, MetricDefinition>): ComputedMetric {
  return { key, value, populationCount, definition: defs.get(key) ?? null };
}

export async function getMetricDefinitions(supabase: SupabaseClient): Promise<Map<string, MetricDefinition>> {
  const { data } = await supabase
    .from("metric_definitions")
    .select("key, name, description, formula, population, exclusions, unit, category, refresh_frequency")
    .eq("active", true);
  const map = new Map<string, MetricDefinition>();
  for (const d of data ?? []) {
    map.set(d.key, {
      key: d.key,
      name: d.name,
      description: d.description,
      formula: d.formula,
      population: d.population,
      exclusions: d.exclusions,
      unit: d.unit,
      category: d.category,
      refreshFrequency: d.refresh_frequency,
    });
  }
  return map;
}

export async function computeWorkforceMetrics(supabase: SupabaseClient, orgId: string): Promise<WorkforceMetrics> {
  const defs = await getMetricDefinitions(supabase);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const trailing30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const trailing60 = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: offboardingsPeriod },
    { data: latestRun },
    { data: attendanceRows },
    { data: leaveRequests },
    { data: leavePolicies },
    { data: requisitions },
    { data: positionsRows },
    { data: openApprovals },
    { data: slaServiceRequests },
    { data: appraisalGoals },
    { data: appraisals },
    { data: enrollments },
    { data: complianceDocs },
    { data: activeWorkforcePlans },
    { data: activeCompensationBudgets },
  ] = await Promise.all([
    supabase.from("employees").select("id, department, status, date_of_hire, employment_type"),
    supabase
      .from("offboarding_records")
      .select("employee_id, status, last_working_day, employees(department)")
      .eq("status", "Completed")
      .gte("last_working_day", periodStart),
    supabase
      .from("payroll_runs")
      .select("id, status, payslips(gross, employee_id, employees(department))")
      .in("status", ["paid", "closed", "processed"])
      .order("period", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("attendance").select("employee_id, clock_in, clock_out, work_date, employees(department)").gte("work_date", trailing30),
    supabase.from("leave_requests").select("days, leave_type, status").eq("status", "Approved").gte("start_date", `${now.getFullYear()}-01-01`),
    supabase.from("leave_policies").select("leave_type, annual_entitlement_days"),
    supabase.from("requisitions").select("id, status, raised_on"),
    supabase.from("positions").select("id, status, is_active"),
    supabase.from("approval_requests").select("id, status, created_at").in("status", ["draft", "submitted", "pending_approval", "returned"]),
    supabase.from("service_requests").select("id, status, sla_due_at, resolved_at").not("sla_due_at", "is", null),
    supabase.from("appraisal_goals").select("id, manager_rating, appraisals!inner(status)"),
    supabase.from("appraisals").select("id, status"),
    supabase.from("training_enrollments").select("id, status"),
    supabase.from("compliance_documents").select("id, expiry_date").lte("expiry_date", trailing60),
    supabase.from("workforce_plans").select("id, planning_period_start, planning_period_end, status, workforce_plan_lines(planned_headcount)").eq("org_id", orgId).eq("status", "active").lte("planning_period_start", today).gte("planning_period_end", today),
    supabase.from("compensation_budgets").select("id, budgeted_amount, budget_period_start, budget_period_end").eq("org_id", orgId).lte("budget_period_start", today).gte("budget_period_end", today),
  ]);

  const activeEmployees = (employees ?? []).filter((e) => e.status === "Active");
  const headcountActive = activeEmployees.length;
  const newHires = (employees ?? []).filter((e) => e.date_of_hire >= periodStart).length;
  const exits = (offboardingsPeriod ?? []).length;
  // Simple average-headcount turnover: exits / ((opening + closing) / 2),
  // opening approximated as closing + exits - hires this period.
  const closingHc = headcountActive;
  const openingHc = Math.max(closingHc + exits - newHires, 1);
  const turnoverRate = (exits / ((openingHc + closingHc) / 2)) * 100;

  const headcountByDeptMap = new Map<string, number>();
  for (const e of activeEmployees) headcountByDeptMap.set(e.department, (headcountByDeptMap.get(e.department) ?? 0) + 1);

  const payslips = (latestRun?.payslips ?? []) as unknown as { gross: number; employee_id: string; employees: { department: string } | null }[];
  const payrollCostGross = payslips.reduce((s, p) => s + Number(p.gross), 0);
  const payrollCostPerEmployee = payslips.length > 0 ? payrollCostGross / payslips.length : 0;
  const costByDeptMap = new Map<string, number>();
  for (const p of payslips) {
    const dept = p.employees?.department ?? "Unassigned";
    costByDeptMap.set(dept, (costByDeptMap.get(dept) ?? 0) + Number(p.gross));
  }

  type AttendanceRow = { employee_id: string; clock_in: string | null; clock_out: string | null; work_date: string; employees: { department: string } | null };
  const attRows = (attendanceRows ?? []) as unknown as AttendanceRow[];
  const presentRows = attRows.filter((r) => r.clock_in);
  const lateRows = presentRows.filter((r) => r.clock_in && r.clock_in > "08:15");
  const expectedWorkingDays = Math.max(attRows.length, 1);
  const attendancePresenceRate = (presentRows.length / expectedWorkingDays) * 100;
  const attendanceLatenessRate = presentRows.length > 0 ? (lateRows.length / presentRows.length) * 100 : 0;

  const presenceByDeptTotal = new Map<string, number>();
  const presenceByDeptPresent = new Map<string, number>();
  for (const r of attRows) {
    const dept = r.employees?.department ?? "Unassigned";
    presenceByDeptTotal.set(dept, (presenceByDeptTotal.get(dept) ?? 0) + 1);
    if (r.clock_in) presenceByDeptPresent.set(dept, (presenceByDeptPresent.get(dept) ?? 0) + 1);
  }

  const annualEntitlement = (leavePolicies ?? []).find((p) => p.leave_type === "Annual")?.annual_entitlement_days ?? 21;
  const annualDaysTaken = (leaveRequests ?? []).filter((r) => r.leave_type === "Annual").reduce((s, r) => s + r.days, 0);
  const leaveUtilisation = headcountActive > 0 ? (annualDaysTaken / (annualEntitlement * headcountActive)) * 100 : 0;

  const openRoles = (requisitions ?? []).filter((r) => r.status === "Open").length;
  const filledRoles = (requisitions ?? []).filter((r) => r.status === "Closed");
  // raised_on -> "now" is the closest proxy available without a dedicated
  // filled_at column; treated as an approximation, consistent with the
  // metric's stated formula/exclusions shown in its definition card.
  const avgTimeToFill =
    filledRoles.length > 0
      ? filledRoles.reduce((s, r) => s + (now.getTime() - new Date(r.raised_on).getTime()) / 86400000, 0) / filledRoles.length
      : 0;

  type GoalRow = { id: string; manager_rating: number | null; appraisals: { status: string } };
  const goals = (appraisalGoals ?? []) as unknown as GoalRow[];
  const goalCompletion = goals.length > 0 ? (goals.filter((g) => (g.manager_rating ?? 0) >= 4).length / goals.length) * 100 : 0;
  const appraisalCompletion =
    (appraisals ?? []).length > 0 ? ((appraisals ?? []).filter((a) => a.status === "Completed").length / (appraisals ?? []).length) * 100 : 0;

  const learningCompletion =
    (enrollments ?? []).length > 0 ? ((enrollments ?? []).filter((e) => e.status === "Completed").length / (enrollments ?? []).length) * 100 : 0;

  const expiringDocs = (complianceDocs ?? []).length;

  // Area 10 §5.3 additions.
  // FTE: no dedicated fractional-FTE field exists on employees yet, so a
  // configured default fraction is used per employment_type (documented in
  // the metric's own definition card, same disclosed-approximation pattern
  // as recruitment_time_to_fill above). Part-time/casual count as 0.5,
  // everything else (permanent, contract, probation) counts as 1.0.
  const fteFraction = (employmentType: string | null) => {
    const t = (employmentType ?? "").toLowerCase();
    if (t.includes("part") || t.includes("casual")) return 0.5;
    return 1.0;
  };
  const fte = activeEmployees.reduce((s, e) => s + fteFraction((e as { employment_type?: string | null }).employment_type ?? null), 0);

  const activePositions = (positionsRows ?? []).filter((p) => p.is_active);
  const vacantPositions = activePositions.filter((p) => p.status === "vacant");
  const vacancyRate = activePositions.length > 0 ? (vacantPositions.length / activePositions.length) * 100 : 0;

  // Overtime: computed from the same classifyDay() logic attendance uses
  // elsewhere (actual hours worked beyond the standard shift length), since
  // this build has no separate overtime-approval workflow — recorded, not
  // "approved", overtime. Approximation disclosed in the definition card.
  const overtimeHours = attRows.reduce((sum, r) => {
    if (!r.clock_in || !r.clock_out) return sum;
    const [inH, inM] = r.clock_in.split(":").map(Number);
    const [outH, outM] = r.clock_out.split(":").map(Number);
    const hours = outH + outM / 60 - (inH + inM / 60);
    const standardHours = 8;
    return sum + Math.max(0, hours - standardHours);
  }, 0);

  const approvalsOpen = openApprovals ?? [];
  const approvalAgeing =
    approvalsOpen.length > 0
      ? approvalsOpen.reduce((s, r) => s + (now.getTime() - new Date(r.created_at).getTime()) / 86400000, 0) / approvalsOpen.length
      : 0;

  const slaCases = slaServiceRequests ?? [];
  const slaCompliant = slaCases.filter((c) => {
    const due = new Date(c.sla_due_at as string).getTime();
    const measuredAt = c.resolved_at ? new Date(c.resolved_at).getTime() : now.getTime();
    return measuredAt <= due;
  });
  const caseSlaCompliance = slaCases.length > 0 ? (slaCompliant.length / slaCases.length) * 100 : 100;

  // Area 10 extension (spec §5.11): sum planned headcount across every
  // workforce plan whose status is "active" and whose period covers today,
  // compared against actual active headcount. Zero active plans -> no
  // denominator, reported as 0 variance rather than dividing by zero (there
  // is simply nothing to vary from yet).
  type PlanWithLines = { workforce_plan_lines: { planned_headcount: number }[] };
  const plannedHeadcountTotal = (activeWorkforcePlans ?? []).reduce(
    (sum, plan) => sum + ((plan as unknown as PlanWithLines).workforce_plan_lines ?? []).reduce((s, l) => s + (l.planned_headcount ?? 0), 0),
    0
  );
  const workforcePlanVariance = plannedHeadcountTotal > 0 ? ((headcountActive - plannedHeadcountTotal) / plannedHeadcountTotal) * 100 : 0;

  // Area 10 extension: sum approved compensation budgets covering today vs
  // current gross payroll cost. Same zero-denominator convention as above.
  const budgetedAmountTotal = (activeCompensationBudgets ?? []).reduce((sum, b) => sum + Number(b.budgeted_amount), 0);
  const compensationBudgetVariance = budgetedAmountTotal > 0 ? ((payrollCostGross - budgetedAmountTotal) / budgetedAmountTotal) * 100 : 0;

  const metrics: WorkforceMetrics = {
    headcountActive: withDef("headcount_active", headcountActive, headcountActive, defs),
    headcountNewHires: withDef("headcount_new_hires", newHires, newHires, defs),
    headcountExits: withDef("headcount_exits", exits, exits, defs),
    turnoverRate: withDef("turnover_rate", turnoverRate, headcountActive, defs),
    payrollCostGross: withDef("payroll_cost_gross", payrollCostGross, payslips.length, defs),
    payrollCostPerEmployee: withDef("payroll_cost_per_employee", payrollCostPerEmployee, payslips.length, defs),
    attendancePresenceRate: withDef("attendance_presence_rate", attendancePresenceRate, attRows.length, defs),
    attendanceLatenessRate: withDef("attendance_lateness_rate", attendanceLatenessRate, presentRows.length, defs),
    leaveUtilisation: withDef("leave_utilisation", leaveUtilisation, headcountActive, defs),
    recruitmentOpenRoles: withDef("recruitment_open_roles", openRoles, (requisitions ?? []).length, defs),
    recruitmentTimeToFill: withDef("recruitment_time_to_fill", avgTimeToFill, filledRoles.length, defs),
    performanceGoalCompletion: withDef("performance_goal_completion", goalCompletion, goals.length, defs),
    performanceAppraisalCompletion: withDef("performance_appraisal_completion", appraisalCompletion, (appraisals ?? []).length, defs),
    learningCompletionRate: withDef("learning_completion_rate", learningCompletion, (enrollments ?? []).length, defs),
    complianceExpiringDocuments: withDef("compliance_expiring_documents", expiringDocs, expiringDocs, defs),
    fte: withDef("fte", fte, activeEmployees.length, defs),
    vacancyRate: withDef("vacancy_rate", vacancyRate, activePositions.length, defs),
    overtimeHours: withDef("overtime_hours", overtimeHours, attRows.length, defs),
    approvalAgeing: withDef("approval_ageing", approvalAgeing, approvalsOpen.length, defs),
    caseSlaCompliance: withDef("case_sla_compliance", caseSlaCompliance, slaCases.length, defs),
    workforcePlanVariance: withDef("workforce_plan_variance", workforcePlanVariance, plannedHeadcountTotal, defs),
    compensationBudgetVariance: withDef("compensation_budget_variance", compensationBudgetVariance, (activeCompensationBudgets ?? []).length, defs),
    headcountByDepartment: Array.from(headcountByDeptMap.entries()).map(([dept, count]) => ({
      segmentLabel: dept,
      segmentValue: dept,
      value: count,
      populationCount: count,
    })),
    costByDepartment: Array.from(costByDeptMap.entries()).map(([dept, cost]) => ({
      segmentLabel: dept,
      segmentValue: dept,
      value: cost,
      populationCount: payslips.filter((p) => (p.employees?.department ?? "Unassigned") === dept).length,
    })),
    presenceByDepartment: Array.from(presenceByDeptTotal.entries()).map(([dept, total]) => ({
      segmentLabel: dept,
      segmentValue: dept,
      value: total > 0 ? ((presenceByDeptPresent.get(dept) ?? 0) / total) * 100 : 0,
      populationCount: total,
    })),
    computedAt: now.toISOString(),
  };

  // Best-effort snapshot write for trend history — never blocks rendering
  // if it fails (e.g. a transient write conflict), matches the notify
  // module's "best effort" convention for background-ish writes.
  try {
    const rows = [
      { org_id: orgId, metric_key: "headcount_active", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: headcountActive, population_count: headcountActive },
      { org_id: orgId, metric_key: "payroll_cost_gross", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: payrollCostGross, population_count: payslips.length },
      { org_id: orgId, metric_key: "turnover_rate", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: turnoverRate, population_count: headcountActive },
      { org_id: orgId, metric_key: "attendance_presence_rate", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: attendancePresenceRate, population_count: attRows.length },
      { org_id: orgId, metric_key: "fte", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: fte, population_count: activeEmployees.length },
      { org_id: orgId, metric_key: "vacancy_rate", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: vacancyRate, population_count: activePositions.length },
      { org_id: orgId, metric_key: "overtime_hours", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: overtimeHours, population_count: attRows.length },
      { org_id: orgId, metric_key: "approval_ageing", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: approvalAgeing, population_count: approvalsOpen.length },
      { org_id: orgId, metric_key: "case_sla_compliance", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: caseSlaCompliance, population_count: slaCases.length },
      { org_id: orgId, metric_key: "workforce_plan_variance", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: workforcePlanVariance, population_count: plannedHeadcountTotal },
      { org_id: orgId, metric_key: "compensation_budget_variance", dimension_key: "all", dimension_value: "all", snapshot_date: today, value: compensationBudgetVariance, population_count: (activeCompensationBudgets ?? []).length },
    ];
    await supabase.from("metric_snapshots").upsert(rows, { onConflict: "org_id,metric_key,dimension_key,dimension_value,snapshot_date" });
  } catch {
    // Non-fatal — the dashboard still renders from the on-demand values above.
  }

  return metrics;
}

export async function getMetricTrend(supabase: SupabaseClient, metricKey: string, points = 12): Promise<TrendPoint[]> {
  const { data } = await supabase
    .from("metric_snapshots")
    .select("snapshot_date, value")
    .eq("metric_key", metricKey)
    .eq("dimension_key", "all")
    .order("snapshot_date", { ascending: true })
    .limit(points);
  return (data ?? []).map((r) => ({ label: r.snapshot_date, value: Number(r.value) }));
}
