// Area 11 Rules screen (§13) — the rule catalogue and active suppressions.
// Editing a rule's weights/thresholds isn't wired yet (scope note at the
// bottom); this screen is read + suppression-create for now.
import { createClient } from "@/lib/supabase/server";
import { createRiskSuppression } from "@/lib/intelligence/risk/actions";

export default async function RiskRulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const [{ data: rules }, { data: suppressions }] = await Promise.all([
    supabase.from("workforce_risk_rules").select("id, code, name, description, category, is_active, threshold_config").order("code"),
    supabase
      .from("workforce_risk_suppressions")
      .select("id, rule_id, entity_type, entity_id, reason, ends_at, authorised_by, workforce_risk_rules(code)")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Risk Rules &amp; Suppressions</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">The §6.7 rule catalogue and any authorised time-bound suppressions (§6.8).</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {(rules ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800 align-top">
                <td className="px-4 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-300">{r.code}</td>
                <td className="px-4 py-2">
                  <p className="text-neutral-800 dark:text-neutral-100">{r.name}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">{r.description}</p>
                  {!r.is_active && (r.threshold_config as { deferred_reason?: string })?.deferred_reason && (
                    <p className="text-xs text-amber-700 mt-0.5">Not yet wired: {(r.threshold_config as { deferred_reason?: string }).deferred_reason}</p>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{r.category.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.is_active ? "bg-green-100 text-green-700" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500"}`}>
                    {r.is_active ? "Active" : "Not wired"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Create a suppression</h2>
        <form action={createRiskSuppression} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
          <select name="rule_id" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5">
            <option value="">Rule…</option>
            {(rules ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.code}</option>
            ))}
          </select>
          <input name="entity_type" placeholder="Entity type (e.g. employee)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="entity_id" placeholder="Entity ID (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="ends_at" type="date" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="reason" placeholder="Reason (required, audited)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <button type="submit" className="sm:col-span-5 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">
            Create suppression
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Active suppressions</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(suppressions ?? []).map((s) => {
              const rule = s.workforce_risk_rules as unknown as { code: string } | null;
              return (
                <tr key={s.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 font-mono text-xs">{rule?.code}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{s.entity_type} {s.entity_id ? `(${s.entity_id.slice(0, 8)}…)` : "(all)"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{s.reason}</td>
                  <td className="px-4 py-2 text-xs text-neutral-400 dark:text-neutral-500">until {new Date(s.ends_at).toLocaleDateString("en-KE")}</td>
                </tr>
              );
            })}
            {(suppressions ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500">No active suppressions.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
