import { createClient } from "@/lib/supabase/server";
import { createAssignment, deleteAssignment } from "./actions";
import { StatusSelect } from "./status-select";

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-neutral-100 text-neutral-600",
  "In Progress": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
};

export default async function AssignmentsPage() {
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
  const canAssign = isHrLike || appUser?.role === "manager";

  const [{ data: assignments }, { data: employees }] = await Promise.all([
    supabase
      .from("assignments")
      .select("id, employee_id, type, title, description, due_date, status, created_at, employees(name)")
      .order("created_at", { ascending: false }),
    canAssign
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">
          {isHrLike ? "Assignments" : appUser?.role === "manager" ? "Team Assignments" : "My Assignments"}
        </h1>
        <p className="text-sm text-neutral-500">Tasks and assets assigned to employees — status is updated by whoever it&apos;s assigned to.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {canAssign && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Status</th>
              {canAssign && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {(assignments ?? []).map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                {canAssign && (
                  <td className="px-4 py-2">
                    {(a.employees as unknown as { name: string } | null)?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-2">{a.type}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900">{a.title}</div>
                  {a.description && <div className="text-xs text-neutral-500">{a.description}</div>}
                </td>
                <td className="px-4 py-2">{a.due_date ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[a.status] ?? ""}`}>{a.status}</span>
                    <StatusSelect assignmentId={a.id} status={a.status} />
                  </div>
                </td>
                {canAssign && (
                  <td className="px-4 py-2">
                    <form action={deleteAssignment.bind(null, a.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {(!assignments || assignments.length === 0) && (
              <tr>
                <td colSpan={canAssign ? 6 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No assignments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canAssign && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">New assignment</h2>
          <form action={createAssignment} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <select name="employee_id" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <select name="type" defaultValue="Task" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="Task">Task</option>
              <option value="Asset">Asset</option>
            </select>
            <input name="due_date" type="date" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input
              name="title"
              placeholder="Title (e.g. Laptop, Onboarding checklist)"
              required
              className="sm:col-span-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <textarea
              name="description"
              placeholder="Notes (optional)"
              rows={2}
              className="sm:col-span-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Create assignment
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
