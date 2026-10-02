// Area 05 §8 "My Pay" — latest payslip card + history, strictly self-scoped
// (getMyPayslips binds to ctx.employeeId; payslips_self_read RLS enforces
// the same boundary independently of this query). Bank details stay masked
// here (no raw value is read at all, let alone rendered). Each row links to
// the secure single-payslip viewer, which is where the actual
// view/download access gets logged.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyPayslips } from "@/lib/employee-portal/get-my-pay";
import EmptyState from "@/components/employee-portal/empty-state";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function MyPayPage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const payslips = await getMyPayslips(supabase, ctx.employeeId);
  const latest = payslips[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Pay</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Your own payslips only — bank details stay masked.</p>
      </div>

      {latest && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Latest payslip — {latest.period}</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 mt-1">KES {fmt(latest.net)} net</p>
          <Link href={`/dashboard/me/pay/${latest.id}`} className="inline-block mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">
            View payslip →
          </Link>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Payslip history</h2>
        {payslips.length === 0 ? (
          <div className="p-4"><EmptyState message="No published payslips yet." /></div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium text-right">Gross</th>
                <th className="px-4 py-2 font-medium text-right">Net</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{p.period}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(p.gross)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(p.net)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/dashboard/me/pay/${p.id}`} className="text-brand-600 hover:underline text-xs font-medium">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">Have a question about a payslip? <Link href="/dashboard/me/requests" className="text-brand-600 hover:underline">Raise it with HR</Link>.</p>
    </div>
  );
}
