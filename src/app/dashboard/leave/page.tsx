import { createClient } from "@/lib/supabase/server";
import { applyForLeave } from "./actions";
import DecideButtons from "./decide-buttons";

export default async function LeavePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const canDecide = appUser?.role === "admin" || appUser?.role === "hr" || appUser?.role === "manager";

  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, days, status, reason, employees(name)")
    .order("applied_on", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Leave</h1>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {canDecide && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Dates</th>
              <th className="px-4 py-2 font-medium">Days</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canDecide && <th className="px-4 py-2 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                {canDecide && (
                  <td className="px-4 py-2">
                    {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-2">{r.leave_type}</td>
                <td className="px-4 py-2">
                  {r.start_date} → {r.end_date}
                </td>
                <td className="px-4 py-2">{r.days}</td>
                <td className="px-4 py-2">{r.status}</td>
                {canDecide && (
                  <td className="px-4 py-2">
                    {r.status === "Pending" ? <DecideButtons id={r.id} /> : null}
                  </td>
                )}
              </tr>
            ))}
            {(!requests || requests.length === 0) && (
              <tr>
                <td colSpan={canDecide ? 6 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No leave requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {appUser?.employee_id && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Apply for leave</h2>
          <form action={applyForLeave} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <select name="leave_type" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option>Annual</option>
              <option>Sick</option>
              <option>Compassionate</option>
              <option>Maternity</option>
              <option>Paternity</option>
              <option>Unpaid</option>
              <option>Study</option>
            </select>
            <input name="start_date" type="date" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="end_date" type="date" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="reason" placeholder="Reason (optional)" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Submit request
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
