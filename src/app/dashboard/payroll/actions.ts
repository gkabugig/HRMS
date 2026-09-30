"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { computePayslip, sickLeavePayReduction, type StatutoryRates } from "@/lib/payroll/calculate";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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

export async function runPayroll(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const period = String(formData.get("period")); // 'YYYY-MM'

  const { data: rateRow, error: rateErr } = await supabase
    .from("statutory_rates")
    .select("*")
    .eq("org_id", DEFAULT_ORG_ID)
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
    .eq("org_id", DEFAULT_ORG_ID)
    .eq("status", "Active");
  if (empErr) throw new Error(empErr.message);

  const { data: run, error: runErr } = await supabase
    .from("payroll_runs")
    .insert({ org_id: DEFAULT_ORG_ID, period, generated_by: user!.id })
    .select()
    .single();
  if (runErr) throw new Error(runErr.message);

  const { data: advances } = await supabase
    .from("salary_advances")
    .select("*")
    .eq("status", "Active");

  // Section 30 sick-leave tiers: figure out, per employee, how many sick
  // days were already used in the trailing 12-month window before this
  // period, and how many fall inside this period's calendar month.
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
    const advanceRequested = empAdvances.reduce(
      (sum, a) => sum + Math.min(a.monthly_repayment, a.balance),
      0
    );

    const empSickLeaves = (sickLeaves ?? []).filter((l) => l.employee_id === emp.id);
    const daysAlreadyUsed = empSickLeaves
      .filter((l) => l.start_date < `${period}-01`)
      .reduce((sum, l) => sum + l.days, 0);
    const daysThisPeriod = empSickLeaves
      .filter((l) => l.start_date >= `${period}-01`)
      .reduce((sum, l) => sum + l.days, 0);
    const dailyRate = (emp.basic || 0) / 26;
    const leaveReduction = sickLeavePayReduction(daysAlreadyUsed, daysThisPeriod, dailyRate);

    const slip = computePayslip(emp, rates, advanceRequested, leaveReduction);
    payslipRows.push({
      payroll_run_id: run.id,
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

    // Only reduce advance balances by what was actually applied to this
    // payslip (slip.advance_applied), which may be less than requested if
    // the s.19(1)(h)/s.19(3) caps kicked in — the shortfall simply rolls
    // to next period's run rather than being written off.
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

  revalidatePath("/dashboard/payroll");
}
