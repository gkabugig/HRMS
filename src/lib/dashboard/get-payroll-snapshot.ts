// Payroll Snapshot (spec §8). Reads the latest payroll_runs row for the
// org and its payslips — no duplicate payroll tables, no hard-coded period.
// RLS already restricts payroll_runs/payslips to admin/hr/self, so a
// manager or employee simply gets an empty/own-only result here; the
// dashboard hides this card entirely for roles without canViewPayroll.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, PayrollSnapshot } from "./dashboard-types";

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getPayrollSnapshot(
  supabase: SupabaseClient,
  context: DashboardContext,
  selectedPeriod?: string
): Promise<PayrollSnapshot> {
  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, period")
    .eq("org_id", context.orgId)
    .order("period", { ascending: false })
    .limit(24);

  const availablePeriods = (runs ?? []).map((r) => r.period);
  const latest = selectedPeriod ? (runs ?? []).find((r) => r.period === selectedPeriod) ?? null : runs?.[0] ?? null;
  const latestIndex = latest ? (runs ?? []).findIndex((r) => r.id === latest.id) : -1;
  const previous = latestIndex >= 0 ? runs?.[latestIndex + 1] ?? null : null;

  if (!latest) {
    return {
      visible: true,
      period: selectedPeriod ?? context.currentPeriod,
      gross: 0,
      net: 0,
      deductions: 0,
      employeesProcessed: 0,
      grossChangePct: null,
      netChangePct: null,
      deductionsChangePct: null,
      previousPeriod: null,
      hasRunForPeriod: false,
      availablePeriods,
    };
  }

  const [{ data: latestSlips }, { data: prevSlips }] = await Promise.all([
    supabase.from("payslips").select("gross, net, nssf, shif, housing_levy, paye, other_deductions").eq("payroll_run_id", latest.id),
    previous
      ? supabase.from("payslips").select("gross, net, nssf, shif, housing_levy, paye, other_deductions").eq("payroll_run_id", previous.id)
      : Promise.resolve({ data: null }),
  ]);

  const sum = (rows: typeof latestSlips, key: "gross" | "net") =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
  const sumDeductions = (rows: typeof latestSlips) =>
    (rows ?? []).reduce(
      (s, r) => s + Number(r.nssf ?? 0) + Number(r.shif ?? 0) + Number(r.housing_levy ?? 0) + Number(r.paye ?? 0) + Number(r.other_deductions ?? 0),
      0
    );

  const gross = sum(latestSlips, "gross");
  const net = sum(latestSlips, "net");
  const deductions = sumDeductions(latestSlips);

  const prevGross = sum(prevSlips, "gross");
  const prevNet = sum(prevSlips, "net");
  const prevDeductions = sumDeductions(prevSlips);

  return {
    visible: true,
    period: latest.period,
    gross,
    net,
    deductions,
    employeesProcessed: (latestSlips ?? []).length,
    grossChangePct: previous ? pctChange(gross, prevGross) : null,
    netChangePct: previous ? pctChange(net, prevNet) : null,
    deductionsChangePct: previous ? pctChange(deductions, prevDeductions) : null,
    previousPeriod: previous?.period ?? null,
    hasRunForPeriod: true,
    availablePeriods,
  };
}
