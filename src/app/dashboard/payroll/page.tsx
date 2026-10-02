// Payroll (list). Admin/hr see every payroll period as a run with a
// status, and drill into a run for the full Payroll Command Centre;
// employees keep their existing "My Payslips" list, now naturally limited
// to payslips that have actually been published (see the published_at RLS
// change in 0017_payroll_command_centre.sql).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prepareDraftRun } from "./actions";
import PayrollStatusBadge from "./components/payroll-status-badge";
import type { PayrollStatus } from "@/lib/payroll/state-machine";

export default async function PayrollPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  if (isHrLike) {
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("id, period, status, locked, generated_at, payslips(id, gross, net)")
      .order("period", { ascending: false });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Payroll</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Prepare, calculate, review and approve each payroll period.</p>
          </div>
        </div>

        <form
          action={prepareDraftRun}
          className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 flex items-end gap-3 text-sm"
        >
          <div>
            <label className="block text-neutral-700 dark:text-neutral-200 mb-1">New payroll period</label>
            <input
              name="period"
              type="month"
              required
              defaultValue={new Date().toISOString().slice(0, 7)}
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
          </div>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
            Prepare Payroll
          </button>
        </form>

        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Employees</th>
                <th className="px-4 py-2 font-medium text-right">Gross</th>
                <th className="px-4 py-2 font-medium text-right">Net</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r) => {
                const slips = (r.payslips ?? []) as unknown as { id: string; gross: number; net: number }[];
                const gross = slips.reduce((s, p) => s + Number(p.gross), 0);
                const net = slips.reduce((s, p) => s + Number(p.net), 0);
                return (
                  <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-2 font-medium text-neutral-900 dark:text-neutral-50">{r.period}</td>
                    <td className="px-4 py-2">
                      <PayrollStatusBadge status={r.status as PayrollStatus} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{slips.length}</td>
                    <td className="px-4 py-2 text-right font-mono">{gross > 0 ? gross.toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{net > 0 ? net.toLocaleString() : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/dashboard/payroll/${r.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {(!runs || runs.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No payroll periods yet — prepare one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Employee self-service: unchanged shape, now naturally limited to
  // published payslips by RLS.
  const { data: payslips } = await supabase
    .from("payslips")
    .select("id, gross, net, paye, nssf, shif, housing_levy, leave_deduction, deduction_capped, payroll_runs(period)")
    .eq("employee_id", appUser?.employee_id ?? "")
    .order("id", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Payslips</h1>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium text-right">Gross</th>
              <th className="px-4 py-2 font-medium text-right">PAYE</th>
              <th className="px-4 py-2 font-medium text-right">NSSF</th>
              <th className="px-4 py-2 font-medium text-right">SHIF</th>
              <th className="px-4 py-2 font-medium text-right">Housing</th>
              <th className="px-4 py-2 font-medium text-right">Leave</th>
              <th className="px-4 py-2 font-medium text-right">Net</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(payslips ?? []).map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">{(p.payroll_runs as unknown as { period: string } | null)?.period}</td>
                <td className="px-4 py-2 text-right font-mono">{p.gross.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.paye.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.nssf.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.shif.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.housing_levy.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.leave_deduction > 0 ? `-${p.leave_deduction.toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{p.net.toLocaleString()}</td>
                <td className="px-4 py-2">
                  {p.deduction_capped && (
                    <span
                      className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded"
                      title="Deductions were capped at two-thirds of gross pay (s.19(3)); the remainder rolls to next period."
                    >
                      Capped
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {(!payslips || payslips.length === 0) && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No published payslips yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
