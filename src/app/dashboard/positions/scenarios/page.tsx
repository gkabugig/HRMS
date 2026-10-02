// Area 16 §7.9 — what-if scenarios: headcount/cost deltas layered on top of
// an optional base plan, for comparison without committing to a real plan.
import { createClient } from "@/lib/supabase/server";
import { createWorkforceScenario } from "@/lib/positions/admin-actions";
import Link from "next/link";

export default async function WorkforceScenariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const [{ data: scenarios }, { data: plans }] = await Promise.all([
    supabase.from("workforce_scenarios").select("id, name, status, created_at, workforce_plans(name)").eq("org_id", appUser.org_id).order("created_at", { ascending: false }),
    supabase.from("workforce_plans").select("id, name").eq("org_id", appUser.org_id).order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Workforce Scenarios</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">What-if headcount/cost deltas — not committed plans.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">New scenario</h2>
        <form action={createWorkforceScenario} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input name="name" placeholder="Scenario name" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 sm:col-span-2" />
          <select name="base_plan_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
            <option value="">No base plan…</option>
            {(plans ?? []).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Create scenario</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(scenarios ?? []).map((s) => {
              const basePlan = s.workforce_plans as unknown as { name: string } | null;
              return (
                <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/positions/scenarios/${s.id}`} className="text-neutral-800 dark:text-neutral-100 hover:underline">{s.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">{basePlan?.name ?? "No base plan"}</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">{s.status}</span>
                  </td>
                </tr>
              );
            })}
            {(scenarios ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500">No scenarios yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
