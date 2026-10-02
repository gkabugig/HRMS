// Area 17 §8.4 payroll_export_batches — traceable, versioned handoff of
// effective compensation changes to external payroll. Distinct from Area
// 15's payroll_runs (actual payroll execution).
import { createClient } from "@/lib/supabase/server";
import { generatePayrollExportBatch, markPayrollExportBatchSent, markPayrollExportBatchConfirmed } from "@/lib/compensation/payroll-export-actions";

export default async function PayrollExportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const { data: batches } = await supabase.from("payroll_export_batches").select("id, period, status, row_count, checksum, exported_at").eq("org_id", appUser.org_id).order("exported_at", { ascending: false });

  const statusColor: Record<string, string> = {
    generated: "bg-amber-100 text-amber-700",
    sent: "bg-blue-100 text-blue-700",
    confirmed: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Payroll Export</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Hand off this period&apos;s effective compensation changes to external payroll.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <form action={generatePayrollExportBatch} className="flex gap-2 text-xs">
          <input name="period" placeholder="Period (e.g. 2026-11)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Generate batch</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Rows</th>
              <th className="px-4 py-2 font-medium">Checksum</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b) => (
              <tr key={b.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2 text-neutral-800 dark:text-neutral-100">{b.period}</td>
                <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{b.row_count}</td>
                <td className="px-4 py-2 font-mono text-xs text-neutral-400 dark:text-neutral-500">{b.checksum}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[b.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{b.status}</span>
                </td>
                <td className="px-4 py-2 text-right text-xs">
                  {b.status === "generated" && (
                    <form action={async () => { "use server"; await markPayrollExportBatchSent(b.id); }}>
                      <button type="submit" className="text-brand-700 hover:underline">Mark sent</button>
                    </form>
                  )}
                  {b.status === "sent" && (
                    <form action={async () => { "use server"; await markPayrollExportBatchConfirmed(b.id); }}>
                      <button type="submit" className="text-green-700 hover:underline">Mark confirmed</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(batches ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500" colSpan={5}>No export batches yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
