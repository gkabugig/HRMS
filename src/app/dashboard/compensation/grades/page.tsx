// Area 17 §8.4 — grade framework and effective salary bands.
import { createClient } from "@/lib/supabase/server";
import { createCompensationGrade, createCompensationBand } from "@/lib/compensation/admin-actions";

export default async function CompensationGradesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const { data: grades } = await supabase
    .from("compensation_grades")
    .select("id, code, name, order_rank, compensation_bands(id, currency, min_amount, max_amount, effective_from, effective_to)")
    .eq("org_id", appUser.org_id)
    .order("order_rank");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Compensation Grades &amp; Bands</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Position → Grade → Salary Band → Employee Compensation.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">New grade</h2>
        <form action={createCompensationGrade} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input name="code" placeholder="Code (e.g. G1)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="name" placeholder="Name (e.g. Grade 1 — Entry)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 sm:col-span-2" />
          <input name="order_rank" type="number" placeholder="Order (lowest first)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">Add grade</button>
        </form>
      </div>

      <div className="space-y-4">
        {(grades ?? []).map((g) => {
          const bands = (g.compensation_bands as unknown as { id: string; currency: string; min_amount: number; max_amount: number; effective_from: string; effective_to: string | null }[]) ?? [];
          return (
            <div key={g.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{g.name} <span className="text-xs text-neutral-400 dark:text-neutral-500 font-normal">({g.code})</span></h3>
              <table className="w-full text-sm mt-2 mb-3">
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="px-2 py-1.5 text-xs text-neutral-600 dark:text-neutral-300">{b.currency} {Number(b.min_amount).toLocaleString()} — {Number(b.max_amount).toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">from {b.effective_from}{b.effective_to ? ` to ${b.effective_to}` : ""}</td>
                    </tr>
                  ))}
                  {bands.length === 0 && (
                    <tr><td className="px-2 py-1.5 text-xs text-neutral-400 dark:text-neutral-500">No band defined.</td></tr>
                  )}
                </tbody>
              </table>
              <form action={createCompensationBand} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                <input type="hidden" name="grade_id" value={g.id} />
                <input name="min_amount" type="number" step="0.01" placeholder="Min (KES)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
                <input name="max_amount" type="number" step="0.01" placeholder="Max (KES)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
                <input name="effective_from" type="date" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
                <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 text-white rounded px-3 py-1.5 font-medium">Add band</button>
              </form>
            </div>
          );
        })}
        {(grades ?? []).length === 0 && <p className="text-xs text-neutral-400 dark:text-neutral-500">No grades defined yet.</p>}
      </div>
    </div>
  );
}
