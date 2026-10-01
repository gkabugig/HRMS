// Area 17 §8.4 compensation_plans — package definitions used as a starting
// point for change requests.
import { createClient } from "@/lib/supabase/server";
import { createCompensationPlan } from "@/lib/compensation/admin-actions";

export default async function CompensationPlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: plans }, { data: grades }] = await Promise.all([
    supabase.from("compensation_plans").select("id, name, description, default_basic, default_house_allowance, default_transport_allowance, default_other_allowance, compensation_grades(name)").eq("org_id", appUser.org_id).order("name"),
    supabase.from("compensation_grades").select("id, name").eq("org_id", appUser.org_id).order("order_rank"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Compensation Plans</h1>
        <p className="text-sm text-neutral-500 mt-1">Package definitions — a default basic/allowance split for a grade.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <form action={createCompensationPlan} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <input name="name" placeholder="Plan name" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <select name="grade_id" className="border border-neutral-200 rounded px-2 py-1.5">
            <option value="">Grade…</option>
            {(grades ?? []).map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
          <input name="description" placeholder="Description (optional)" className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="default_basic" type="number" step="0.01" placeholder="Default basic" className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="default_house_allowance" type="number" step="0.01" placeholder="House allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="default_transport_allowance" type="number" step="0.01" placeholder="Transport allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="default_other_allowance" type="number" step="0.01" placeholder="Other allowance" className="border border-neutral-200 rounded px-2 py-1.5" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">Add plan</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(plans ?? []).map((p) => {
              const grade = p.compensation_grades as unknown as { name: string } | null;
              const total = (Number(p.default_basic) || 0) + (Number(p.default_house_allowance) || 0) + (Number(p.default_transport_allowance) || 0) + (Number(p.default_other_allowance) || 0);
              return (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{p.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{grade?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">KES {total.toLocaleString()}</td>
                </tr>
              );
            })}
            {(plans ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={3}>No plans defined yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
