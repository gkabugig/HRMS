// Area 05 §7 "My Leave" — balances, own calendar (approved/pending), apply
// and cancel. Backed entirely by the existing leave module
// (src/app/dashboard/leave/actions.ts: applyForLeave/cancelLeaveRequest,
// unchanged) — this page is a self-service-styled presentation layer, not a
// second leave engine. Decisions still happen on /dashboard/leave?view=requests
// (manager/HR) exactly as before; nothing here writes a status directly
// (spec §7 "never bypass approval by directly writing leave status").
import ActionForm from "@/components/forms/action-form";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getLeaveBalances } from "@/lib/leave/get-leave-balances";
import { applyForLeave, cancelLeaveRequest } from "@/app/dashboard/leave/actions";
import EmptyState from "@/components/employee-portal/empty-state";

const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export default async function MyLeavePage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);

  const [balances, { data: leaveTypes }, { data: requests }] = await Promise.all([
    getLeaveBalances(supabase, ctx.orgId, [ctx.employeeId]),
    supabase.from("leave_policies").select("leave_type").eq("org_id", ctx.orgId),
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, reason, applied_on")
      .eq("employee_id", ctx.employeeId)
      .order("applied_on", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Leave</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Balances, requests and approval status.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {balances.map((b) => (
          <div key={b.leaveType} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{b.leaveType}</p>
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{b.remaining}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">of {b.entitlement} days remaining</p>
            {b.pending > 0 && <p className="text-xs text-amber-600 mt-1">{b.pending} pending</p>}
          </div>
        ))}
        {balances.length === 0 && (
          <div className="sm:col-span-3"><EmptyState message="No leave policy configured for your organisation yet." /></div>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Apply for leave</h2>
        <ActionForm action={applyForLeave} successMessage="Leave request sent." className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <select name="leave_type" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">Select leave type…</option>
            {(leaveTypes ?? []).map((t) => (
              <option key={t.leave_type} value={t.leave_type}>{t.leave_type}</option>
            ))}
          </select>
          <div />
          <input type="date" name="start_date" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
          <input type="date" name="end_date" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
          <textarea name="reason" placeholder="Reason (optional)" rows={2} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 sm:col-span-2" />
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium justify-self-start sm:col-span-2">
            Submit request
          </button>
        </ActionForm>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Your requests</h2>
        {!requests || requests.length === 0 ? (
          <div className="p-4"><EmptyState message="No leave requests yet." /></div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Dates</th>
                <th className="px-4 py-2 font-medium">Days</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{r.leave_type}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{r.start_date} → {r.end_date}</td>
                  <td className="px-4 py-2">{r.days}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {r.status === "Pending" && (
                      <ActionForm action={cancelLeaveRequest.bind(null, r.id)} successMessage={null}>
                        <button className="text-xs text-red-600 hover:underline">Cancel</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
