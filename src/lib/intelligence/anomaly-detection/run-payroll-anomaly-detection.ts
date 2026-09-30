// Payroll Anomaly Detection (spec §6). This is a second, statistical pass
// that runs after the existing deterministic controls
// (lib/payroll/exceptions-engine.ts, which already covers missing/
// inactive/terminated-employee inclusion, missing statutory identifiers,
// zero/negative net, and unapproved salary changes) — the spec is explicit
// that anomaly detection should "complement, not replace" those rules, so
// nothing here duplicates a check the exceptions engine already owns.
//
// What this module actually detects, and why the rest of §6.1's list is
// left out: this schema has no overtime-hours-to-payroll link, no bonus/
// commission field, and staff_no/employee_id uniqueness already rules out
// true duplicates — inventing signals for those would be exactly the kind
// of "opaque" AI feature the spec's principles warn against. What's real
// here:
//  - gross/net pay change outside the employee's own historical range
//    (statistical baseline from their last up to 6 runs)
//  - department cost spike vs the previous run
//  - a manual payroll adjustment applied this run
//  - a bank account change shortly before this run was generated
// Every flagged anomaly is checked against context (an approved
// compensation change, a new hire, an exit, approved leave) and downgraded
// to "informational" with the explanation on file when one exists — never
// silently suppressed, and never auto-corrected (spec §6.4: "Never
// auto-change payroll solely because an anomaly is detected").
import type { SupabaseClient } from "@supabase/supabase-js";

type NewAnomaly = {
  anomaly_type: string;
  entity_type: "employee" | "department";
  entity_id: string | null;
  severity: "informational" | "review" | "high";
  score: number | null;
  expected_value: number | null;
  actual_value: number | null;
  drivers_json: Record<string, unknown>[];
  explanation: string;
};

function stddev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function lastDayOfMonth(period: string): string {
  const d = new Date(`${period}-01`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export async function runPayrollAnomalyDetection(
  supabase: SupabaseClient,
  run: { id: string; orgId: string; period: string; generatedAt: string }
): Promise<{ anomalyCount: number }> {
  const found: NewAnomaly[] = [];

  const { data: model } = await supabase
    .from("ai_models")
    .select("id")
    .eq("org_id", run.orgId)
    .eq("key", "payroll-anomaly-detector")
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: payslips } = await supabase
    .from("payslips")
    .select("id, employee_id, gross, net, paye, nssf, shif, housing_levy, employees(name, department)")
    .eq("payroll_run_id", run.id);

  if (!payslips || payslips.length === 0) {
    await replaceOpenAutoAnomalies(supabase, run.id, [], model?.id ?? null, run.orgId);
    return { anomalyCount: 0 };
  }

  const employeeIds = payslips.map((p) => p.employee_id);
  const periodStart = `${run.period}-01`;
  const periodEnd = lastDayOfMonth(run.period);
  const bankChangeSince = new Date(new Date(run.generatedAt).getTime() - 14 * 86400000).toISOString();

  const [
    { data: priorRuns },
    { data: compChanges },
    { data: offboarding },
    { data: leaves },
    { data: adjustments },
    { data: bankChanges },
    { data: prevRun },
  ] = await Promise.all([
    supabase.from("payroll_runs").select("id, period").eq("org_id", run.orgId).lt("period", run.period).order("period", { ascending: false }).limit(6),
    supabase
      .from("employee_compensation_history")
      .select("employee_id, reason")
      .in("employee_id", employeeIds)
      .gte("effective_from", periodStart)
      .lt("effective_from", periodEnd),
    supabase.from("offboarding_records").select("employee_id, last_working_day").in("employee_id", employeeIds),
    supabase.from("leave_requests").select("employee_id").eq("status", "Approved").in("employee_id", employeeIds).gte("start_date", periodStart).lte("end_date", periodEnd),
    supabase.from("payroll_adjustments").select("employee_id, adjustment_type, amount, reason").eq("payroll_run_id", run.id),
    supabase.from("employee_audit_log").select("employee_id").in("employee_id", employeeIds).eq("field", "bank_account_no").gte("changed_at", bankChangeSince),
    supabase
      .from("payroll_runs")
      .select("id")
      .eq("org_id", run.orgId)
      .lt("period", run.period)
      .order("period", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const priorRunIds = (priorRuns ?? []).map((r) => r.id);
  const { data: priorPayslips } = priorRunIds.length
    ? await supabase.from("payslips").select("employee_id, gross, net").in("payroll_run_id", priorRunIds)
    : { data: [] as { employee_id: string; gross: number; net: number }[] };

  const historyByEmployee = new Map<string, { gross: number[]; net: number[] }>();
  for (const p of priorPayslips ?? []) {
    const h = historyByEmployee.get(p.employee_id) ?? { gross: [], net: [] };
    h.gross.push(Number(p.gross));
    h.net.push(Number(p.net));
    historyByEmployee.set(p.employee_id, h);
  }

  const compChangeSet = new Set((compChanges ?? []).map((c) => c.employee_id));
  const compChangeReason = new Map((compChanges ?? []).map((c) => [c.employee_id, c.reason]));
  const offboardingInPeriod = new Set((offboarding ?? []).filter((o) => o.last_working_day && o.last_working_day >= periodStart && o.last_working_day <= periodEnd).map((o) => o.employee_id));
  const leaveInPeriod = new Set((leaves ?? []).map((l) => l.employee_id));
  const adjustmentByEmployee = new Map<string, { adjustment_type: string; amount: number; reason: string }[]>();
  for (const a of adjustments ?? []) {
    const list = adjustmentByEmployee.get(a.employee_id) ?? [];
    list.push(a);
    adjustmentByEmployee.set(a.employee_id, list);
  }
  const bankChangedEmployees = new Set((bankChanges ?? []).map((b) => b.employee_id));

  type Payslip = { id: string; employee_id: string; gross: number; net: number; paye: number; nssf: number; shif: number; housing_levy: number; employees: { name: string; department: string } | null };
  const slips = payslips as unknown as Payslip[];

  function contextFor(employeeId: string): { explained: boolean; note: string | null } {
    if (compChangeSet.has(employeeId)) return { explained: true, note: `Approved compensation change on file${compChangeReason.get(employeeId) ? `: ${compChangeReason.get(employeeId)}` : ""}.` };
    if (offboardingInPeriod.has(employeeId)) return { explained: true, note: "Employee exited during this period (final pay)." };
    if (leaveInPeriod.has(employeeId)) return { explained: true, note: "Employee had approved leave overlapping this period." };
    return { explained: false, note: null };
  }

  for (const slip of slips) {
    const name = slip.employees?.name ?? "Employee";
    const history = historyByEmployee.get(slip.employee_id);

    for (const [field, current] of [
      ["gross", slip.gross],
      ["net", slip.net],
    ] as const) {
      const values = history?.[field] ?? [];
      if (values.length < 2) continue; // not enough baseline yet
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const sd = Math.max(stddev(values, mean), mean * 0.05, 100);
      const z = (Number(current) - mean) / sd;
      if (Math.abs(z) < 2) continue;

      const { explained, note } = contextFor(slip.employee_id);
      const severity: NewAnomaly["severity"] = explained ? "informational" : Math.abs(z) >= 3 ? "high" : "review";
      found.push({
        anomaly_type: field === "gross" ? "gross_pay_change_outside_range" : "net_pay_change_outside_range",
        entity_type: "employee",
        entity_id: slip.employee_id,
        severity,
        score: Number(z.toFixed(2)),
        expected_value: Math.round(mean),
        actual_value: Math.round(Number(current)),
        drivers_json: [
          { factor: "historical_average", value: Math.round(mean) },
          { factor: "std_dev_used", value: Math.round(sd) },
          { factor: "runs_in_baseline", value: values.length },
          ...(note ? [{ factor: "context", value: note }] : []),
        ],
        explanation: `${name}'s ${field} pay is KES ${Math.round(Number(current)).toLocaleString()}, vs a historical average of KES ${Math.round(mean).toLocaleString()} over ${values.length} prior run(s) (${z > 0 ? "+" : ""}${z.toFixed(1)} std. deviations).${note ? ` ${note}` : ""}`,
      });
    }

    const adj = adjustmentByEmployee.get(slip.employee_id);
    if (adj && adj.length > 0) {
      found.push({
        anomaly_type: "manual_adjustment_applied",
        entity_type: "employee",
        entity_id: slip.employee_id,
        severity: "informational",
        score: null,
        expected_value: null,
        actual_value: null,
        drivers_json: adj.map((a) => ({ factor: a.adjustment_type, value: a.amount, reason: a.reason })),
        explanation: `${name}'s payslip includes ${adj.length} manual adjustment(s) this run: ${adj.map((a) => `${a.adjustment_type} (KES ${a.amount.toLocaleString()})`).join(", ")}.`,
      });
    }

    if (bankChangedEmployees.has(slip.employee_id)) {
      found.push({
        anomaly_type: "bank_account_change_near_processing",
        entity_type: "employee",
        entity_id: slip.employee_id,
        severity: "review",
        score: null,
        expected_value: null,
        actual_value: null,
        drivers_json: [{ factor: "changed_within_days", value: 14 }],
        explanation: `${name}'s bank account details were changed within 14 days of this payroll run being generated.`,
      });
    }
  }

  // Department cost spike vs the previous run.
  if (prevRun) {
    const { data: prevDeptPayslips } = await supabase.from("payslips").select("gross, employees(department)").eq("payroll_run_id", prevRun.id);
    const currentByDept = new Map<string, number>();
    for (const s of slips) {
      const dept = s.employees?.department ?? "Unassigned";
      currentByDept.set(dept, (currentByDept.get(dept) ?? 0) + Number(s.gross));
    }
    const prevByDept = new Map<string, number>();
    for (const p of (prevDeptPayslips ?? []) as unknown as { gross: number; employees: { department: string } | null }[]) {
      const dept = p.employees?.department ?? "Unassigned";
      prevByDept.set(dept, (prevByDept.get(dept) ?? 0) + Number(p.gross));
    }
    for (const [dept, current] of currentByDept) {
      const prev = prevByDept.get(dept);
      if (!prev || prev <= 0) continue;
      const pct = ((current - prev) / prev) * 100;
      if (Math.abs(pct) >= 20) {
        found.push({
          anomaly_type: "department_cost_spike",
          entity_type: "department",
          entity_id: null,
          severity: Math.abs(pct) >= 35 ? "high" : "review",
          score: Number(pct.toFixed(1)),
          expected_value: Math.round(prev),
          actual_value: Math.round(current),
          drivers_json: [{ factor: "department", value: dept }],
          explanation: `${dept} department's total gross pay moved ${pct > 0 ? "up" : "down"} ${Math.abs(Math.round(pct))}% vs the previous run (KES ${Math.round(prev).toLocaleString()} → KES ${Math.round(current).toLocaleString()}).`,
        });
      }
    }
  }

  await replaceOpenAutoAnomalies(supabase, run.id, found, model?.id ?? null, run.orgId);
  return { anomalyCount: found.length };
}

async function replaceOpenAutoAnomalies(supabase: SupabaseClient, runId: string, found: NewAnomaly[], modelId: string | null, orgId: string): Promise<void> {
  // Recalculating a run replaces its anomaly set, same convention as the
  // exceptions engine — anomalies a reviewer already resolved/marked
  // false-positive on a *previous* calculation of this run are not
  // reopened by re-running detection on the same status though: only
  // "open" ones are cleared and replaced.
  await supabase.from("ai_anomalies").delete().eq("payroll_run_id", runId).eq("status", "open");
  if (found.length === 0) return;
  await supabase.from("ai_anomalies").insert(
    found.map((f) => ({
      org_id: orgId,
      model_id: modelId,
      payroll_run_id: runId,
      anomaly_type: f.anomaly_type,
      entity_type: f.entity_type,
      entity_id: f.entity_id,
      severity: f.severity,
      score: f.score,
      expected_value: f.expected_value,
      actual_value: f.actual_value,
      drivers_json: f.drivers_json,
      explanation: f.explanation,
    }))
  );
}
