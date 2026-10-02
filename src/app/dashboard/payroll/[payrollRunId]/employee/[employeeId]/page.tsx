// Employee Payroll Detail (spec §17). A dedicated page rather than a
// sliding drawer — this app is server-rendered with essentially no client
// JS by convention (see the rest of the Employee 360 build), and a page
// keeps the "flag exception"/"add adjustment" forms simple server actions
// without a client-side panel to manage. The breadcrumb keeps the payroll
// context the spec asks not to lose.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addAdjustment } from "../../actions";
import PayslipDocument from "@/components/payroll/payslip-document";
import PrintButton from "./print-button";

function money(n: number): string {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export default async function PayrollEmployeeDetailPage({
  params,
}: {
  params: Promise<{ payrollRunId: string; employeeId: string }>;
}) {
  const { payrollRunId, employeeId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const canManage = appUser?.role === "admin" || appUser?.role === "hr";
  if (!canManage) notFound();

  const [{ data: run }, { data: employee }, { data: payslip }, { data: adjustments }, { data: history }] = await Promise.all([
    supabase.from("payroll_runs").select("id, period, status, locked").eq("id", payrollRunId).eq("org_id", appUser.org_id).maybeSingle(),
    supabase.from("employees").select("id, name, staff_no, department, job_title").eq("id", employeeId).maybeSingle(),
    supabase
      .from("payslips")
      .select(
        "gross, paye, nssf, shif, housing_levy, other_deductions, leave_deduction, deduction_capped, net, employer_nssf, employer_housing_levy, employees(basic, house_allowance, transport_allowance, other_allowance)"
      )
      .eq("payroll_run_id", payrollRunId)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    supabase.from("payroll_adjustments").select("id, adjustment_type, amount, reason, created_at").eq("payroll_run_id", payrollRunId).eq("employee_id", employeeId).order("created_at", { ascending: false }),
    supabase
      .from("payslips")
      .select("id, net, payroll_runs(period)")
      .eq("employee_id", employeeId)
      .order("id", { ascending: false })
      .limit(6),
  ]);

  if (!run || !employee) notFound();

  const comp = payslip?.employees as unknown as { basic: number; house_allowance: number; transport_allowance: number; other_allowance: number } | null;
  const adjustmentTotal = (adjustments ?? []).reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div className="space-y-6 max-w-2xl print:mx-0">
      <Link href={`/dashboard/payroll/${run.id}`} className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 hover:dark:text-neutral-300 inline-block print:hidden">
        ← Back to {run.period} payroll
      </Link>

      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{employee.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {employee.staff_no} • {employee.department} • {employee.job_title}
          </p>
        </div>
        {payslip && (
          <div className="shrink-0">
            <PrintButton />
          </div>
        )}
      </div>

      {!payslip ? (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-6 text-sm text-neutral-500 dark:text-neutral-400">
          No payslip for this employee on this run.
        </div>
      ) : (
        <PayslipDocument
          period={run.period}
          employeeName={employee.name}
          staffNo={employee.staff_no}
          department={employee.department}
          basicSalary={comp?.basic ?? 0}
          allowances={(comp?.house_allowance ?? 0) + (comp?.transport_allowance ?? 0) + (comp?.other_allowance ?? 0)}
          grossPay={payslip.gross}
          nssf={payslip.nssf}
          shif={payslip.shif}
          housingLevy={payslip.housing_levy}
          paye={payslip.paye}
          netPay={payslip.net + adjustmentTotal}
          employerNssf={payslip.employer_nssf}
          employerHousingLevy={payslip.employer_housing_levy}
          extraDeductions={[
            ...(payslip.leave_deduction > 0 ? [{ label: "Leave deduction", amount: payslip.leave_deduction }] : []),
            ...(payslip.other_deductions > 0 ? [{ label: "Other deductions", amount: payslip.other_deductions }] : []),
            ...(adjustmentTotal !== 0 ? [{ label: "Adjustments", amount: adjustmentTotal }] : []),
          ]}
          deductionCapNote={
            payslip.deduction_capped
              ? "Statutory deductions were capped at two-thirds of gross pay (Employment Act s.19(3)); the remainder rolls to next period."
              : undefined
          }
        />
      )}

      {adjustments && adjustments.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5 print:hidden">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Adjustments on this run</h2>
          <ul className="space-y-1.5 text-sm">
            {adjustments.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="text-neutral-600 dark:text-neutral-300">
                  {a.adjustment_type} — {a.reason}
                </span>
                <span className={`font-mono ${Number(a.amount) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(Number(a.amount))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!run.locked && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5 print:hidden">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Add a controlled adjustment</h2>
          <form action={addAdjustment} className="space-y-2.5 text-sm">
            <input type="hidden" name="run_id" value={run.id} />
            <input type="hidden" name="employee_id" value={employee.id} />
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Type</label>
                <select name="adjustment_type" className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-2.5 py-1.5">
                  <option>Correction</option>
                  <option>Bonus</option>
                  <option>Recovery</option>
                  <option>Reimbursement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Amount (KES)</label>
                <input name="amount" type="number" step="0.01" required className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">Reason (required)</label>
              <input name="reason" required className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-2.5 py-1.5" />
            </div>
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
              Add adjustment
            </button>
          </form>
        </div>
      )}

      {history && history.length > 1 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5 print:hidden">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Payslip history</h2>
          <ul className="space-y-1.5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between">
                <span className="text-neutral-600 dark:text-neutral-300">{(h.payroll_runs as unknown as { period: string } | null)?.period}</span>
                <span className="font-mono text-neutral-700 dark:text-neutral-200">{money(h.net)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
