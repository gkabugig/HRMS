// Area 17 §8.6 — a manager's own view: submit review-cycle recommendations
// for direct reports (RLS: compensation_review_items_manager_read/
// _recommend) and propose one-off compensation changes
// (compensation_change_requests_manager_create/_read).
import { createClient } from "@/lib/supabase/server";
import { submitManagerRecommendation } from "@/lib/compensation/review-actions";
import { submitCompensationChangeRequest } from "@/lib/compensation/change-request-actions";

export default async function ManagerCompensationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user!.id).maybeSingle();
  if (!appUser) return null;

  const [{ data: pendingItems }, { data: myRequests }, { data: reports }] = await Promise.all([
    supabase
      .from("compensation_review_items")
      .select("id, status, manager_recommendation_pct, manager_comment, employees(name, basic), compensation_review_cycles(name, period_start, period_end)")
      .in("status", ["pending", "recommended"])
      .order("created_at"),
    supabase
      .from("compensation_change_requests")
      .select("id, status, effective_from, proposed_basic, employees(name)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_direct_reports", { p_manager_employee_id: appUser.employee_id, p_as_of: new Date().toISOString().slice(0, 10) }),
  ]);

  const reportIds: string[] = (reports.data ?? []).map((r: { employee_id: string }) => r.employee_id);
  const { data: reportEmployees } = reportIds.length
    ? await supabase.from("employees").select("id, name").in("id", reportIds)
    : { data: [] as { id: string; name: string }[] };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Compensation</h1>
        <p className="text-sm text-neutral-500 mt-1">Recommend review-cycle increases and propose compensation changes for your direct reports.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">Review recommendations due</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(pendingItems ?? []).map((item) => {
              const employee = item.employees as unknown as { name: string; basic: number } | null;
              const cycle = item.compensation_review_cycles as unknown as { name: string } | null;
              return (
                <tr key={item.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2 text-neutral-800">{employee?.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{cycle?.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">KES {Number(employee?.basic ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {item.status === "pending" ? (
                      <form action={submitManagerRecommendation} className="flex gap-1 items-center text-xs">
                        <input type="hidden" name="item_id" value={item.id} />
                        <input name="manager_recommendation_pct" type="number" step="0.1" placeholder="% increase" required className="w-20 border border-neutral-200 rounded px-1.5 py-1" />
                        <input name="manager_comment" placeholder="Comment" className="border border-neutral-200 rounded px-1.5 py-1" />
                        <button type="submit" className="text-brand-700 hover:underline">Submit</button>
                      </form>
                    ) : (
                      <span className="text-xs text-neutral-500">Recommended {item.manager_recommendation_pct}%</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {(pendingItems ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={4}>No review recommendations due.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Propose a compensation change</h2>
        <form action={submitCompensationChangeRequest} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select name="employee_id" required className="border border-neutral-200 rounded px-2 py-1.5">
              <option value="">Direct report…</option>
              {(reportEmployees ?? []).map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
            </select>
            <input name="proposed_basic" type="number" step="0.01" placeholder="Proposed basic" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="effective_from" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          </div>
          <textarea name="reason" placeholder="Reason (required)" required rows={2} className="border border-neutral-200 rounded px-2 py-1.5 w-full" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Submit for HR approval</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">My submitted requests</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(myRequests ?? []).map((r) => {
              const employee = r.employees as unknown as { name: string } | null;
              return (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{employee?.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{r.effective_from}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{r.status}</td>
                </tr>
              );
            })}
            {(myRequests ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={3}>No requests submitted yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
