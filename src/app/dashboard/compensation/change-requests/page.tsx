// Area 17 §8.3/§8.8 — compensation change requests register. Submission UI
// also lives here for HR/admin (managers use /dashboard/manager/compensation
// for their own reports); approval decisions happen in the universal
// /dashboard/approvals inbox.
import { createClient } from "@/lib/supabase/server";
import { submitCompensationChangeRequest, cancelCompensationChangeRequest } from "@/lib/compensation/change-request-actions";

export default async function CompensationChangeRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: employees }, { data: grades }, { data: requests }] = await Promise.all([
    supabase.from("employees").select("id, name").eq("org_id", appUser.org_id).eq("status", "Active").order("name"),
    supabase.from("compensation_grades").select("id, name").eq("org_id", appUser.org_id).order("order_rank"),
    supabase
      .from("compensation_change_requests")
      .select("id, status, effective_from, proposed_basic, is_outside_band, reason, created_at, employees(name)")
      .eq("org_id", appUser.org_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const statusColor: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-500",
    submitted: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    scheduled: "bg-indigo-100 text-indigo-700",
    effective: "bg-green-100 text-green-700",
    superseded: "bg-slate-200 text-slate-600",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-neutral-100 text-neutral-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Compensation Change Requests</h1>
        <p className="text-sm text-neutral-500 mt-1">Draft → Submitted → Approved → Scheduled → Effective (or Rejected/Cancelled). Routed through Approvals.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">New change request</h2>
        <form action={submitCompensationChangeRequest} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select name="employee_id" required className="border border-neutral-200 rounded px-2 py-1.5">
              <option value="">Employee…</option>
              {(employees ?? []).map((e) => (<option key={e.id} value={e.id}>{e.name}</option>))}
            </select>
            <select name="proposed_grade_id" className="border border-neutral-200 rounded px-2 py-1.5">
              <option value="">Proposed grade (optional)…</option>
              {(grades ?? []).map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
            </select>
            <input name="effective_from" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input name="proposed_basic" type="number" step="0.01" placeholder="Proposed basic" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="proposed_house_allowance" type="number" step="0.01" placeholder="House allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="proposed_transport_allowance" type="number" step="0.01" placeholder="Transport allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
            <input name="proposed_other_allowance" type="number" step="0.01" placeholder="Other allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
          </div>
          <textarea name="reason" placeholder="Reason (required)" required rows={2} className="border border-neutral-200 rounded px-2 py-1.5 w-full" />
          <input name="exception_reason" placeholder="Exception justification (only needed if proposed basic falls outside the grade's band)" className="border border-neutral-200 rounded px-2 py-1.5 w-full" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Submit for approval</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Effective</th>
              <th className="px-4 py-2 font-medium">Proposed basic</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => {
              const employee = r.employees as unknown as { name: string } | null;
              return (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{employee?.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{r.effective_from}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{r.proposed_basic ? `KES ${Number(r.proposed_basic).toLocaleString()}` : "—"} {r.is_outside_band && <span className="text-amber-600">(outside band)</span>}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[r.status] ?? "bg-neutral-100"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {["draft", "submitted", "approved", "scheduled"].includes(r.status) && (
                      <form action={async () => { "use server"; await cancelCompensationChangeRequest(r.id); }}>
                        <button type="submit" className="text-xs text-red-500 hover:underline">Cancel</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(requests ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={5}>No change requests yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
