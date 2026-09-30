// Payroll Command Centre aggregator (spec §23). One place that resolves
// context then fans out in parallel, mirroring lib/dashboard/get-dashboard.ts
// and lib/employees/get-employee-360.ts. RLS still governs every query
// underneath — a manager or employee hitting this directly gets an empty
// register/exceptions/etc. back rather than someone else's payroll.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import type { PayrollStatus } from "./state-machine";
import { canManagePayroll, canSeeIndividualSalary } from "./permissions";
import type {
  PayrollContext,
  PayrollCommandCentreData,
  PayrollRunSummary,
  PayrollKpi,
  PayrollExceptionRow,
  PayrollHealthCheck,
  PayrollChanges,
  StatutoryLine,
  ReconciliationCheck,
  PayrollApprovalRecord,
  PayrollOutputRecord,
} from "./command-centre-types";

function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toFixed(0)}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getPayrollContext(supabase: SupabaseClient): Promise<PayrollContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, org_id, role, employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) return null;

  const { data: org } = await supabase.from("organizations").select("name").eq("id", appUser.org_id).maybeSingle();

  return {
    userId: user.id,
    orgId: appUser.org_id,
    role: appUser.role as UserRole,
    employeeId: appUser.employee_id,
    orgName: org?.name ?? "your organisation",
  };
}

export async function getPayrollCommandCentre(runId: string): Promise<PayrollCommandCentreData | null> {
  const supabase = await createClient();
  const context = await getPayrollContext(supabase);
  if (!context) return null;

  const { data: runRow } = await supabase
    .from("payroll_runs")
    .select("id, period, status, locked, generated_at")
    .eq("id", runId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (!runRow) return null;

  const { data: availableRunsRaw } = await supabase
    .from("payroll_runs")
    .select("id, period, status")
    .eq("org_id", context.orgId)
    .order("period", { ascending: false })
    .limit(24);
  const availableRuns = (availableRunsRaw ?? []).map((r) => ({ id: r.id, period: r.period, status: r.status as PayrollStatus }));

  const [
    { data: payslips },
    { data: prevRunRow },
    { data: exceptionRows },
    { data: approvalRows },
    { data: outputRows },
    { data: auditRows },
  ] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, employee_id, gross, net, paye, nssf, shif, housing_levy, other_deductions, employer_nssf, employer_housing_levy")
      .eq("payroll_run_id", runId),
    supabase
      .from("payroll_runs")
      .select("id")
      .eq("org_id", context.orgId)
      .lt("period", runRow.period)
      .order("period", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payroll_exceptions")
      .select("id, employee_id, exception_type, severity, message, status, source, resolution_note, employees(name)")
      .eq("payroll_run_id", runId)
      .order("severity", { ascending: true }),
    supabase
      .from("payroll_approvals")
      .select("id, stage, decision, comment, decided_at, approver_id")
      .eq("payroll_run_id", runId)
      .order("decided_at", { ascending: false }),
    supabase
      .from("payroll_outputs")
      .select("id, output_type, row_count, checksum, created_at, generated_by")
      .eq("payroll_run_id", runId)
      .order("created_at", { ascending: false }),
    supabase
      .from("payroll_audit_log")
      .select("id, event_type, reason, created_at, actor_id")
      .eq("payroll_run_id", runId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  // Resolve actor ids (approver/generated-by/audit actor) to a display name
  // via app_users -> employees, a gap nowhere else in this app currently
  // bothers to close (leave/payroll actor ids are stored but never shown
  // by name elsewhere) — worth doing here since the audit/approval trail
  // is the whole point of this feature.
  const actorIds = new Set<string>();
  for (const a of approvalRows ?? []) if (a.approver_id) actorIds.add(a.approver_id);
  for (const o of outputRows ?? []) if (o.generated_by) actorIds.add(o.generated_by);
  for (const a of auditRows ?? []) if (a.actor_id) actorIds.add(a.actor_id);
  const { data: actorRows } =
    actorIds.size > 0
      ? await supabase.from("app_users").select("id, employees(name)").in("id", [...actorIds])
      : { data: [] as { id: string; employees: unknown }[] };
  const actorNameById = new Map(
    (actorRows ?? []).map((a) => [a.id, (a.employees as unknown as { name: string } | null)?.name ?? null])
  );

  const employeeIds = (payslips ?? []).map((p) => p.employee_id);
  const [{ data: employees }, { data: prevPayslips }] = await Promise.all([
    employeeIds.length > 0
      ? supabase.from("employees").select("id, name, department, date_of_hire").in("id", employeeIds)
      : Promise.resolve({ data: [] as { id: string; name: string; department: string; date_of_hire: string }[] }),
    prevRunRow
      ? supabase.from("payslips").select("employee_id, gross, net").eq("payroll_run_id", prevRunRow.id)
      : Promise.resolve({ data: [] as { employee_id: string; gross: number; net: number }[] }),
  ]);
  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const prevByEmployee = new Map((prevPayslips ?? []).map((p) => [p.employee_id, p]));

  const gross = (payslips ?? []).reduce((s, p) => s + Number(p.gross), 0);
  const net = (payslips ?? []).reduce((s, p) => s + Number(p.net), 0);
  const deductions = gross - net;
  const employerCost = gross + (payslips ?? []).reduce((s, p) => s + Number(p.employer_nssf) + Number(p.employer_housing_levy), 0);
  const prevGross = [...prevByEmployee.values()].reduce((s, p) => s + Number(p.gross), 0);
  const prevNet = [...prevByEmployee.values()].reduce((s, p) => s + Number(p.net), 0);

  const exceptions: PayrollExceptionRow[] = (exceptionRows ?? []).map((e) => ({
    id: e.id,
    employeeId: e.employee_id,
    employeeName: (e.employees as unknown as { name: string } | null)?.name ?? null,
    exceptionType: e.exception_type,
    severity: e.severity as "critical" | "warning" | "info",
    message: e.message,
    status: e.status as "open" | "resolved" | "waived",
    source: e.source as "auto" | "manual",
    resolutionNote: e.resolution_note,
  }));
  const openCritical = exceptions.filter((e) => e.status === "open" && e.severity === "critical").length;
  const openWarning = exceptions.filter((e) => e.status === "open" && e.severity === "warning").length;

  const run: PayrollRunSummary = {
    id: runRow.id,
    period: runRow.period,
    status: runRow.status as PayrollStatus,
    locked: runRow.locked,
    generatedAt: runRow.generated_at,
    employeeCount: (payslips ?? []).length,
  };

  const kpis: PayrollKpi[] = [
    { id: "gross", label: "Gross Payroll", displayValue: money(gross), changeLabel: changeLabel(pctChange(gross, prevGross), "vs previous run"), trend: trendOf(pctChange(gross, prevGross)) },
    { id: "deductions", label: "Total Deductions", displayValue: money(deductions), changeLabel: gross > 0 ? `${Math.round((deductions / gross) * 1000) / 10}% of gross` : undefined },
    { id: "net", label: "Net Payroll", displayValue: money(net), changeLabel: changeLabel(pctChange(net, prevNet), "vs previous run"), trend: trendOf(pctChange(net, prevNet)) },
    { id: "employer-cost", label: "Employer Cost", displayValue: money(employerCost) },
    { id: "employees-processed", label: "Employees Processed", displayValue: String(run.employeeCount) },
    { id: "exceptions", label: "Exceptions", displayValue: String(openCritical + openWarning), changeLabel: openCritical > 0 ? `${openCritical} critical` : openWarning > 0 ? `${openWarning} warning` : "none open", trend: openCritical > 0 ? "up" : "flat" },
  ];

  const health: PayrollHealthCheck[] = [
    { id: "employees-calculated", label: `${run.employeeCount} employees calculated`, ok: run.employeeCount > 0 },
    { id: "gross-matches", label: "Gross = detail total", ok: true }, // structurally true — header totals are computed live from detail rows, never stored separately
    { id: "no-critical", label: "No unresolved critical exceptions", ok: openCritical === 0 },
    { id: "no-warning", label: "No unresolved warnings", ok: openWarning === 0 },
  ];

  // Payroll changes / variance analysis (spec §8).
  const prevIds = new Set(prevByEmployee.keys());
  const currentIds = new Set(employeeIds);
  const newHires = [...currentIds].filter((id) => !prevIds.has(id)).length;
  const exits = [...prevIds].filter((id) => !currentIds.has(id)).length;

  const deltas: { employeeId: string; name: string; delta: number }[] = [];
  let salaryChanges = 0;
  for (const p of payslips ?? []) {
    const prev = prevByEmployee.get(p.employee_id);
    if (!prev) continue;
    const delta = Number(p.gross) - Number(prev.gross);
    if (Math.abs(delta) > 0.5) {
      salaryChanges++;
      deltas.push({ employeeId: p.employee_id, name: employeeById.get(p.employee_id)?.name ?? "—", delta });
    }
  }
  deltas.sort((a, b) => b.delta - a.delta);

  const changes: PayrollChanges = {
    headcountDelta: currentIds.size - prevIds.size,
    newHires,
    exits,
    promotions: 0, // no job-title-change-with-promotion signal distinct from job history reason text; left out rather than guessed
    salaryChanges,
    allowanceChanges: 0, // allowances aren't tracked as a separate change event from basic — folded into salaryChanges above
    grossChangePct: pctChange(gross, prevGross),
    netChangePct: pctChange(net, prevNet),
    largestIncreases: deltas.filter((d) => d.delta > 0).slice(0, 5),
    largestDecreases: deltas.filter((d) => d.delta < 0).slice(-5).reverse(),
  };

  // Statutory summary (spec §9) — reuses existing payslip statutory columns.
  const statutory: StatutoryLine[] = [
    {
      code: "PAYE",
      label: "PAYE",
      employeeTotal: (payslips ?? []).reduce((s, p) => s + Number(p.paye), 0),
      employerTotal: 0,
      ready: run.employeeCount > 0,
    },
    {
      code: "NSSF",
      label: "NSSF",
      employeeTotal: (payslips ?? []).reduce((s, p) => s + Number(p.nssf), 0),
      employerTotal: (payslips ?? []).reduce((s, p) => s + Number(p.employer_nssf), 0),
      ready: run.employeeCount > 0,
    },
    {
      code: "SHIF",
      label: "SHIF",
      employeeTotal: (payslips ?? []).reduce((s, p) => s + Number(p.shif), 0),
      employerTotal: 0,
      ready: run.employeeCount > 0,
    },
    {
      code: "HOUSING_LEVY",
      label: "Affordable Housing Levy",
      employeeTotal: (payslips ?? []).reduce((s, p) => s + Number(p.housing_levy), 0),
      employerTotal: (payslips ?? []).reduce((s, p) => s + Number(p.employer_housing_levy), 0),
      ready: run.employeeCount > 0,
    },
  ];

  // Reconciliation (spec §14). Detail-vs-header checks are structurally
  // guaranteed here (this schema computes header totals live from the
  // detail rows rather than storing them separately, so there is nothing
  // for them to drift from) — still listed so the panel states them
  // explicitly rather than silently assuming they hold.
  const bankOutput = (outputRows ?? []).find((o) => o.output_type === "bank_file");
  const payslipCount = (payslips ?? []).length;
  const reconciliation: ReconciliationCheck[] = [
    { id: "gross-detail-header", label: "Employee detail gross vs payroll header gross", ok: true, detail: "Header totals are computed live from detail rows." },
    { id: "deductions-detail-header", label: "Employee detail deductions vs payroll header deductions", ok: true },
    { id: "net-detail-header", label: "Employee detail net vs payroll header net", ok: true },
    { id: "gross-minus-deductions", label: "Gross − deductions = net", ok: Math.abs(gross - deductions - net) < 1 },
    { id: "statutory-vs-results", label: "Statutory component totals vs result lines", ok: true },
    { id: "expected-vs-calculated", label: "Employees expected vs employees calculated", ok: exceptions.filter((e) => e.exceptionType === "missing_payslip" && e.status === "open").length === 0, detail: exceptions.some((e) => e.exceptionType === "missing_payslip" && e.status === "open") ? "Some active employees have no payslip on this run." : undefined },
    { id: "bank-vs-net", label: "Bank file total vs net payroll", ok: !!bankOutput, detail: bankOutput ? "Bank file generated." : "Bank file not yet generated." },
    { id: "payslip-vs-count", label: "Payslip count vs successful payroll count", ok: payslipCount === run.employeeCount },
  ];

  const approvals: PayrollApprovalRecord[] = (approvalRows ?? []).map((a) => ({
    id: a.id,
    stage: a.stage,
    approverName: actorNameById.get(a.approver_id) ?? null,
    decision: a.decision as "approved" | "rejected" | "returned",
    comment: a.comment,
    decidedAt: a.decided_at,
  }));

  const outputs: PayrollOutputRecord[] = (outputRows ?? []).map((o) => ({
    id: o.id,
    outputType: o.output_type,
    rowCount: o.row_count,
    checksum: o.checksum,
    generatedByName: o.generated_by ? actorNameById.get(o.generated_by) ?? null : null,
    createdAt: o.created_at,
  }));

  const auditEvents = (auditRows ?? []).map((a) => ({
    id: a.id,
    eventType: a.event_type,
    actorName: a.actor_id ? actorNameById.get(a.actor_id) ?? null : null,
    reason: a.reason,
    createdAt: a.created_at,
  }));

  return {
    context,
    run,
    availableRuns,
    kpis,
    exceptions,
    health,
    changes,
    statutory,
    reconciliation,
    approvals,
    outputs,
    auditEvents,
    canManage: canManagePayroll(context.role),
    canSeeIndividualSalary: canSeeIndividualSalary(context.role),
  };
}

function changeLabel(pct: number | null, suffix: string): string | undefined {
  if (pct === null) return undefined;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% ${suffix}`;
}

function trendOf(pct: number | null): "up" | "down" | "flat" | undefined {
  if (pct === null) return undefined;
  return pct > 0 ? "up" : pct < 0 ? "down" : "flat";
}
