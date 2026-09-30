import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAppraisal } from "./actions";

export default async function PerformancePage() {
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
  // Only HR/admin can open a new appraisal cycle (matches the RLS insert
  // policy on `appraisals`); managers rate and comment but don't initiate.
  const canCreate = isHrLike;

  const [{ data: appraisals }, { data: employees }] = await Promise.all([
    supabase
      .from("appraisals")
      .select("id, cycle, status, final_score, created_at, employees(name)")
      .order("created_at", { ascending: false }),
    canCreate
      ? supabase.from("employees").select("id, name").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">
        {isHrLike ? "Performance" : appUser?.role === "manager" ? "Team Performance" : "My Performance"}
      </h1>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Cycle</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Final Score</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(appraisals ?? []).map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {(a.employees as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">{a.cycle}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      a.status === "Completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-2">{a.final_score ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/dashboard/performance/${a.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {(!appraisals || appraisals.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  No appraisals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Start an appraisal</h2>
          <form action={createAppraisal} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <select name="employee_id" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <input
              name="cycle"
              placeholder="Cycle (e.g. 2026 H1)"
              required
              className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Start appraisal
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
