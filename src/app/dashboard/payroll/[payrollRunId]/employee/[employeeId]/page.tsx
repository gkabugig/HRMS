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
      .select("gross, paye, nssf, shif, housing_levy, other_deductions, net, employees(basic, house_allowance, transport_allowance, other_allowance)")
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
    <div className="space-y-6 max-w-2xl">
      <Link href={`/dashboard/payroll/${run.id}`} className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 hover:dark:text-neutral-300 inline-block">
        ← Back to {run.period} payroll
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{employee.name}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {employee.staff_no} • {employee.department} • {employee.job_title}
        </p>
      </div>

      {!payslip ? (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-6 text-sm text-neutral-500 dark:text-neutral-400">
          No payslip for this employee on this run.
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-6">
          <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-2">Earnings</p>
          <Row label="Basic salary" value={comp?.basic ?? 0} />
          <Row label="House allowance" value={comp?.house_allowance ?? 0} />
          <Row label="Transport" value={comp?.transport_allowance ?? 0} />
          <Row label="Other" value={comp?.other_allowance ?? 0} />
          <Row label="Gross" value={payslip.gross} strong />

          <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mt-4 mb-2">Deductions</p>
          <Row label="PAYE" value={payslip.paye} />
          <Row label="NSSF" value={payslip.nssf} />
          <Row label="SHIF" value={payslip.shif} />
          <Row label="Housing Levy" value={payslip.housing_levy} />
          <Row label="Other" value={payslip.other_deductions} />

          {adjustmentTotal !== 0 && <Row label="Adjustments" value={adjustmentTotal} />}

          <div className="border-t border-[var(--border-subtle)] mt-3 pt-3">
            <Row label="Net" value={payslip.net + adjustmentTotal} strong big />
          </div>
        </div>
      )}

      {adjustments && adjustments.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5">
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
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5">
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
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-5">
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

function Row({ label, value, strong, big }: { label: string; value: number; strong?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`font-mono ${strong ? "font-semibold text-neutral-900 dark:text-neutral-50" : "text-neutral-700 dark:text-neutral-200"} ${big ? "text-lg" : "text-sm"}`}>{money(value)}</span>
    </div>
  );
}
