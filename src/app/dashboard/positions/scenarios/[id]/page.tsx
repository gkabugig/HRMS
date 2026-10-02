// Area 16 §7.9 — scenario detail: net headcount/cost delta vs base plan.
import { createClient } from "@/lib/supabase/server";
import { addScenarioLine, setScenarioStatus } from "@/lib/positions/admin-actions";

export default async function WorkforceScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const [{ data: scenario }, { data: lines }, { data: units }, { data: positionTypes }] = await Promise.all([
    supabase.from("workforce_scenarios").select("*, workforce_plans(name)").eq("id", id).eq("org_id", appUser.org_id).maybeSingle(),
    supabase.from("workforce_scenario_lines").select("id, organisation_unit_id, position_type_id, grade, headcount_delta, cost_delta, notes, organisation_units(name), position_types(name)").eq("scenario_id", id),
    supabase.from("organisation_units").select("id, name").eq("org_id", appUser.org_id).order("name"),
    supabase.from("position_types").select("id, name").eq("org_id", appUser.org_id).order("name"),
  ]);

  if (!scenario) return <div className="text-sm text-neutral-500 dark:text-neutral-400">Scenario not found.</div>;
  const basePlan = scenario.workforce_plans as unknown as { name: string } | null;

  const netHeadcount = (lines ?? []).reduce((sum, l) => sum + (l.headcount_delta ?? 0), 0);
  const netCost = (lines ?? []).reduce((sum, l) => sum + (Number(l.cost_delta) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{scenario.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{basePlan ? `Based on: ${basePlan.name}` : "No base plan"}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">{scenario.status}</span>
          {scenario.status === "draft" && (
            <form action={async () => { "use server"; await setScenarioStatus(id, "active"); }}>
              <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Mark active</button>
            </form>
          )}
          {scenario.status !== "archived" && (
            <form action={async () => { "use server"; await setScenarioStatus(id, "archived"); }}>
              <button type="submit" className="text-xs text-neutral-500 dark:text-neutral-400 hover:underline">Archive</button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <p className={`text-2xl font-semibold ${netHeadcount >= 0 ? "text-green-700" : "text-red-700"}`}>{netHeadcount >= 0 ? "+" : ""}{netHeadcount}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Net headcount delta</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <p className={`text-2xl font-semibold ${netCost >= 0 ? "text-green-700" : "text-red-700"}`}>KES {netCost.toLocaleString()}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Net cost delta</p>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Scenario lines</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(lines ?? []).map((l) => {
              const unit = l.organisation_units as unknown as { name: string } | null;
              const type = l.position_types as unknown as { name: string } | null;
              return (
                <tr key={l.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{unit?.name ?? "Org-wide"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{type?.name ?? "—"} {l.grade ? `(${l.grade})` : ""}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{l.headcount_delta >= 0 ? "+" : ""}{l.headcount_delta} HC</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{l.cost_delta ? `KES ${Number(l.cost_delta).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-400 dark:text-neutral-500">{l.notes}</td>
                </tr>
              );
            })}
            {(lines ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500" colSpan={5}>No lines yet.</td></tr>
            )}
          </tbody>
        </table>
        {scenario.status === "draft" && (
          <form action={addScenarioLine} className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-xs p-4 border-t border-neutral-100 dark:border-neutral-800">
            <input type="hidden" name="scenario_id" value={id} />
            <select name="organisation_unit_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="">Org unit…</option>
              {(units ?? []).map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
            </select>
            <select name="position_type_id" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
              <option value="">Position type…</option>
              {(positionTypes ?? []).map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </select>
            <input name="grade" placeholder="Grade (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <input name="headcount_delta" type="number" placeholder="Headcount delta (+/-)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <input name="cost_delta" type="number" step="0.01" placeholder="Cost delta (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
            <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 text-white rounded px-3 py-1.5 font-medium">Add line</button>
          </form>
        )}
      </div>
    </div>
  );
}
