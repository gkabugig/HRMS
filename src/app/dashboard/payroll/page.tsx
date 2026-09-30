import { createClient } from "@/lib/supabase/server";
import { runPayroll } from "./actions";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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

  let payslips;
  if (isHrLike) {
    const { data } = await supabase
      .from("payslips")
      .select(
        "id, gross, net, paye, nssf, shif, housing_levy, leave_deduction, deduction_capped, employees(name), payroll_runs(period)"
      )
      .order("id", { ascending: false })
      .limit(50);
    payslips = data;
  } else {
    const { data } = await supabase
      .from("payslips")
      .select(
        "id, gross, net, paye, nssf, shif, housing_levy, leave_deduction, deduction_capped, payroll_runs(period)"
      )
      .eq("employee_id", appUser?.employee_id ?? "")
      .order("id", { ascending: false });
    payslips = data;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isHrLike ? "Payroll" : "My Payslips"}
      </h1>

      {isHrLike && (
        <form
          action={runPayroll}
          className="bg-white border border-neutral-200 rounded-lg p-4 flex items-end gap-3 text-sm"
        >
          <input type="hidden" name="org_id" value={DEFAULT_ORG_ID} />
          <div>
            <label className="block text-neutral-700 mb-1">Period</label>
            <input
              name="period"
              type="month"
              required
              defaultValue={new Date().toISOString().slice(0, 7)}
              className="border border-neutral-300 rounded px-3 py-2"
            />
          </div>
          <button type="submit" className="bg-neutral-900 text-white rounded py-2 px-4 font-medium">
            Run payroll
          </button>
        </form>
      )}

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {isHrLike && <th className="px-4 py-2 font-medium">Employee</th>}
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
              <tr key={p.id} className="border-t border-neutral-100">
                {isHrLike && (
                  <td className="px-4 py-2">
                    {(p as unknown as { employees: { name: string } | null }).employees?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-2">
                  {(p.payroll_runs as unknown as { period: string } | null)?.period}
                </td>
                <td className="px-4 py-2 text-right font-mono">{p.gross.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.paye.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.nssf.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.shif.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">{p.housing_levy.toLocaleString()}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {p.leave_deduction > 0 ? `-${p.leave_deduction.toLocaleString()}` : "—"}
                </td>
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
                <td colSpan={isHrLike ? 10 : 9} className="px-4 py-6 text-center text-neutral-400">
                  No payslips yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
