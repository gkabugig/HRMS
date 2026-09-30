// The payroll calculation engine itself (lib/payroll/calculate.ts) already
// existed and is untouched — this module is just the existing "Run
// Payroll" body from the old payroll/actions.ts, extracted so both the
// Payroll Command Centre's "Calculate" transition and any future caller
// can run it against an existing draft/inputs_open payroll_runs row
// instead of creating+calculating in one step. Re-running (from
// under_review back to calculated) replaces this run's payslips rather
// than duplicating them, since payslips are the immutable *result* of the
// most recent calculation, not an append-only ledger.
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePayslip, sickLeavePayReduction, type StatutoryRates } from "./calculate";

function lastDayOfMonth(period: string): string {
  const d = new Date(`${period}-01`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function oneYearBefore(dateStr: string): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export async function calculatePayrollRun(
  supabase: SupabaseClient,
  runId: string,
  orgId: string,
  period: string
): Promise<{ payslipCount: number }> {
  const { data: rateRow, error: rateErr } = await supabase
    .from("statutory_rates")
    .select("*")
    .eq("org_id", orgId)
    .lte("effective_from", `${period}-01`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rateErr) throw new Error(rateErr.message);
  if (!rateRow) throw new Error("No statutory rates configured for this period.");

  const rates = rateRow as unknown as StatutoryRates;

  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "Active");
  if (empErr) throw new Error(empErr.message);

  // Recalculating: clear this run's previous result rows first so we
  // don't end up with duplicate payslips for the same employee/run.
  await supabase.from("payslips").delete().eq("payroll_run_id", runId);

  const { data: advances } = await supabase.from("salary_advances").select("*").eq("status", "Active");

  const periodEnd = lastDayOfMonth(period);
  const windowStart = oneYearBefore(`${period}-01`);
  const { data: sickLeaves } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, days")
    .eq("leave_type", "Sick")
    .eq("status", "Approved")
    .gte("start_date", windowStart)
    .lte("start_date", periodEnd);

  const payslipRows = [];
  for (const emp of employees ?? []) {
    const empAdvances = (advances ?? []).filter((a) => a.employee_id === emp.id);
    const advanceRequested = empAdvances.reduce((sum, a) => sum + Math.min(a.monthly_repayment, a.balance), 0);

    const empSickLeaves = (sickLeaves ?? []).filter((l) => l.employee_id === emp.id);
    const daysAlreadyUsed = empSickLeaves.filter((l) => l.start_date < `${period}-01`).reduce((s, l) => s + l.days, 0);
    const daysThisPeriod = empSickLeaves.filter((l) => l.start_date >= `${period}-01`).reduce((s, l) => s + l.days, 0);
    const dailyRate = (emp.basic || 0) / 26;
    const leaveReduction = sickLeavePayReduction(daysAlreadyUsed, daysThisPeriod, dailyRate);

    const slip = computePayslip(emp, rates, advanceRequested, leaveReduction);
    payslipRows.push({
      payroll_run_id: runId,
      employee_id: emp.id,
      gross: slip.gross,
      nssf: slip.nssf,
      shif: slip.shif,
      housing_levy: slip.housing_levy,
      paye: slip.paye,
      other_deductions: slip.other_deductions,
      net: slip.net,
      employer_nssf: slip.employer_nssf,
      employer_housing_levy: slip.employer_housing_levy,
      leave_deduction: slip.leave_deduction,
      deduction_capped: slip.deduction_capped,
    });

    let remainingToApply = slip.advance_applied;
    for (const adv of empAdvances) {
      if (remainingToApply <= 0) break;
      const requested = Math.min(adv.monthly_repayment, adv.balance);
      const applied = Math.min(requested, remainingToApply);
      remainingToApply -= applied;
      const newBalance = adv.balance - applied;
      await supabase
        .from("salary_advances")
        .update({ balance: newBalance, status: newBalance <= 0 ? "Completed" : "Active" })
        .eq("id", adv.id);
    }
  }

  if (payslipRows.length > 0) {
    const { error: slipErr } = await supabase.from("payslips").insert(payslipRows);
    if (slipErr) throw new Error(slipErr.message);
  }

  return { payslipCount: payslipRows.length };
}
