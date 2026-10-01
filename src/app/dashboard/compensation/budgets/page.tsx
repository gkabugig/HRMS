// Area 17 §8.4 compensation_budgets — approved budgets per org unit/period.
import { createClient } from "@/lib/supabase/server";
import { createCompensationBudget } from "@/lib/compensation/admin-actions";

export default async function CompensationBudgetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: budgets }, { data: units }] = await Promise.all([
    supabase.from("compensation_budgets").select("id, organisation_unit_id, budget_period_start, budget_period_end, budgeted_amount, currency, organisation_units(name)").eq("org_id", appUser.org_id).order("budget_period_start", { ascending: false }),
    supabase.from("organisation_units").select("id, name").eq("org_id", appUser.org_id).order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Compensation Budgets</h1>
        <p className="text-sm text-neutral-500 mt-1">Approved compensation budgets by organisation unit and period — an advisory check against change requests, not a hard block.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <form action={createCompensationBudget} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
          <select name="organisation_unit_id" className="border border-neutral-200 rounded px-2 py-1.5">
            <option value="">Org unit (optional)…</option>
            {(units ?? []).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select>
          <input name="budget_period_start" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="budget_period_end" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="budgeted_amount" type="number" step="0.01" placeholder="Budgeted amount (KES)" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Add budget</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(budgets ?? []).map((b) => {
              const unit = b.organisation_units as unknown as { name: string } | null;
              return (
                <tr key={b.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-800">{unit?.name ?? "Org-wide"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{b.budget_period_start} — {b.budget_period_end}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{b.currency} {Number(b.budgeted_amount).toLocaleString()}</td>
                </tr>
              );
            })}
            {(budgets ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={3}>No budgets set yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
