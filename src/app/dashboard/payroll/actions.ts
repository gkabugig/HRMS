"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { computePayslip, type StatutoryRates } from "@/lib/payroll/calculate";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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

  const payslipRows = [];
  for (const emp of employees ?? []) {
    const empAdvances = (advances ?? []).filter((a) => a.employee_id === emp.id);
    const advanceDeduction = empAdvances.reduce(
      (sum, a) => sum + Math.min(a.monthly_repayment, a.balance),
      0
    );

    const slip = computePayslip(emp, rates, advanceDeduction);
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
    });

    for (const adv of empAdvances) {
      const deduction = Math.min(adv.monthly_repayment, adv.balance);
      const newBalance = adv.balance - deduction;
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
