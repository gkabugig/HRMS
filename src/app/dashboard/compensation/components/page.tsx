// Area 17 §8.4 compensation_components — reference catalogue of pay
// elements (basic/allowances/benefits/deductions). Employee amounts still
// live on employees.basic/house_allowance/transport_allowance/
// other_allowance (payroll's live source) — this screen documents what
// those mean and supports compensation_plans; it isn't itself a payable.
import { createClient } from "@/lib/supabase/server";
import { createCompensationComponent } from "@/lib/compensation/admin-actions";

export default async function CompensationComponentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const { data: components } = await supabase.from("compensation_components").select("id, code, name, component_type, is_taxable, is_active").eq("org_id", appUser.org_id).order("component_type");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Compensation Components</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Reference catalogue of pay elements — basic, allowances, benefits, deductions.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <form action={createCompensationComponent} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
          <input name="code" placeholder="Code" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="name" placeholder="Name" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <select name="component_type" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
            <option value="basic">Basic</option>
            <option value="allowance">Allowance</option>
            <option value="benefit">Benefit</option>
            <option value="deduction">Deduction</option>
          </select>
          <label className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300"><input type="checkbox" name="is_taxable" defaultChecked /> Taxable</label>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Add component</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(components ?? []).map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2 text-neutral-800 dark:text-neutral-100">{c.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-neutral-500 dark:text-neutral-400">{c.code}</td>
                <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 capitalize">{c.component_type}</td>
                <td className="px-4 py-2 text-xs text-neutral-400 dark:text-neutral-500">{c.is_taxable ? "Taxable" : "Non-taxable"}</td>
              </tr>
            ))}
            {(components ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500" colSpan={4}>No components defined yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
