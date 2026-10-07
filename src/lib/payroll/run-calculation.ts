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
  const periodEnd = lastDayOfMonth(period);

  // Prefer the rate row in force by the end of the period (the normal
  // case: rates set up in advance or, for the current period, on some day
  // within it). Fall back to the earliest rate on file if the org only
  // configured rates *after* the period closed — e.g. setting up Settings
  // for the first time and then running payroll for a past month — rather
  // than blocking the run entirely just because no row happens to predate
  // the period's own start.
  const primary = await supabase
    .from("statutory_rates")
    .select("*")
    .eq("org_id", orgId)
    .lte("effective_from", periodEnd)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (primary.error) throw new Error(primary.error.message);
  let rateRow = primary.data;

  if (!rateRow) {
    const fallback = await supabase
      .from("statutory_rates")
      .select("*")
      .eq("org_id", orgId)
      .order("effective_from", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    rateRow = fallback.data;
  }
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

  const windowStart = oneYearBefore(`${period}-01`);
  const { data: sickLeaves } = await supabase
    .from("leave_requests")
    .select("employee_id, start_date, days")
    .eq("leave_type", "Sick")
    .eq("status", "Approved")
    .gte("start_date", windowStart)
    .lte("start_date", periodEnd);

  // Approved bonuses, incentives and awards for this pay period (Rewards
  // module). They are employment income: they join gross pay here, so PAYE
  // and the other statutory deductions apply through computePayslip as usual.
  // Re-running a calculation picks the same rows up again (they stay tied
  // to this run), so nothing is ever paid twice.
  const { data: rewardTx } = await supabase
    .from("reward_transactions")
    .select("id, employee_id, amount, payroll_status, payroll_run_id")
    .eq("org_id", orgId)
    .eq("tx_type", "earning")
    .eq("payroll_period", period)
    .or(`payroll_status.eq.pending,and(payroll_status.eq.included,payroll_run_id.eq.${runId})`);
  const oneOffByEmployee = new Map<string, number>();
  for (const t of rewardTx ?? []) oneOffByEmployee.set(t.employee_id as string, (oneOffByEmployee.get(t.employee_id as string) ?? 0) + Number(t.amount ?? 0));

  const payslipRows = [];
  for (const emp of employees ?? []) {
    const empAdvances = (advances ?? []).filter((a) => a.employee_id === emp.id);
    const advanceRequested = empAdvances.reduce((sum, a) => sum + Math.min(a.monthly_repayment, a.balance), 0);

    const empSickLeaves = (sickLeaves ?? []).filter((l) => l.employee_id === emp.id);
    const daysAlreadyUsed = empSickLeaves.filter((l) => l.start_date < `${period}-01`).reduce((s, l) => s + l.days, 0);
    const daysThisPeriod = empSickLeaves.filter((l) => l.start_date >= `${period}-01`).reduce((s, l) => s + l.days, 0);
    const dailyRate = (emp.basic || 0) / 26;
    const leaveReduction = sickLeavePayReduction(daysAlreadyUsed, daysThisPeriod, dailyRate);

    const oneOff = oneOffByEmployee.get(emp.id) ?? 0;
    const slip = computePayslip(oneOff > 0 ? { ...emp, other_allowance: (emp.other_allowance || 0) + oneOff } : emp, rates, advanceRequested, leaveReduction);
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
      one_off_earnings: oneOff,
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

  if ((rewardTx ?? []).length > 0) {
    await supabase
      .from("reward_transactions")
      .update({ payroll_status: "included", payroll_run_id: runId })
      .in("id", (rewardTx ?? []).map((t) => t.id));
  }

  return { payslipCount: payslipRows.length };
}
