import { getRewardContext, mergePolicy } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { createDefaultPolicy, savePolicy } from "@/lib/rewards/setup-actions";
import { BTN, Empty, INPUT, LABEL, PageHead, Panel } from "../ui";

const POS = ["below", "mid", "above"] as const;

export default async function PolicyPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>The reward policy is managed by HR.</Empty>;
  const { data: versions } = await supabase.from("reward_policies").select("id, version, name, config, created_at").eq("org_id", orgId).order("version", { ascending: false });
  const latest = versions?.[0];

  if (!latest) {
    return (
      <div className="space-y-6">
        <PageHead title="Reward policy" subtitle="Score bands, merit matrix, eligibility and bonus rules." role={role} current="/dashboard/rewards/policy" />
        <Panel title="No policy yet">
          <ActionForm action={createDefaultPolicy} successMessage="Default policy created.">
            <button className={BTN}>Create the default policy</button>
          </ActionForm>
        </Panel>
      </div>
    );
  }
  const c = mergePolicy(latest.config);
  const { data: used } = await supabase.from("reward_cycles").select("policy_id").eq("org_id", orgId);
  const usedIds = new Set((used ?? []).map((u) => u.policy_id as string));

  return (
    <div className="space-y-6">
      <PageHead title="Reward policy" subtitle={`Editing saves a new version (now v${latest.version}). A version used by a cycle never changes, so closed cycles stay reproducible.`} role={role} current="/dashboard/rewards/policy" />

      <ActionForm action={savePolicy} successMessage="Saved as a new policy version." resetOnSuccess={false} className="space-y-6">
        <Panel title="Name">
          <input name="name" defaultValue={`${latest.name} (revised)`} className={INPUT} />
        </Panel>

        <Panel title="Score weights" subtitle="Must total 100%.">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {([["w_kpi", "KPI achievement", c.scoreWeights.kpi], ["w_goals", "Goals", c.scoreWeights.goals], ["w_competencies", "Competencies", c.scoreWeights.competencies], ["w_values", "Values", c.scoreWeights.values], ["w_manager", "Manager", c.scoreWeights.manager]] as const).map(([n, l, v]) => (
              <div key={n}>
                <label className={LABEL}>{l} (%)</label>
                <input name={n} type="number" step="1" defaultValue={v} className={INPUT} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Performance bands" subtitle="The rating a score earns, and the factor it applies to bonuses.">
          <div className="space-y-2">
            {c.bands.map((b, i) => (
              <div key={b.rating} className="grid grid-cols-3 gap-3 items-end">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50 pb-2">{b.rating}</div>
                <div>
                  <label className={LABEL}>From score (%)</label>
                  <input name={`band_${i}_min`} type="number" step="1" defaultValue={b.min} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Bonus factor</label>
                  <input name={`band_${i}_factor`} type="number" step="0.01" defaultValue={b.factor} className={INPUT} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Merit matrix" subtitle="Percentage increase range by rating and where the salary sits in its band.">
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
            <div>
              <label className={LABEL}>“Below range” under (× midpoint)</label>
              <input name="cut_below" type="number" step="0.01" defaultValue={c.rangeCutoffs.belowUnder} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>“Above range” over (× midpoint)</label>
              <input name="cut_above" type="number" step="0.01" defaultValue={c.rangeCutoffs.aboveOver} className={INPUT} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-xs text-neutral-500 dark:text-neutral-400 text-left">
                  <th className="py-1 pr-3 font-medium">Rating</th>
                  {POS.map((p) => (
                    <th key={p} className="py-1 pr-3 font-medium capitalize">{p} range (min – max %)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.bands.map((b, i) => (
                  <tr key={b.rating} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2 pr-3 font-medium text-neutral-900 dark:text-neutral-50 whitespace-nowrap">{b.rating}</td>
                    {POS.map((p) => (
                      <td key={p} className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          <input name={`m_${i}_${p}_min`} type="number" step="0.1" defaultValue={c.meritMatrix[b.rating]?.[p]?.min ?? 0} className={`${INPUT} w-20`} />
                          <span className="text-neutral-400">–</span>
                          <input name={`m_${i}_${p}_max`} type="number" step="0.1" defaultValue={c.meritMatrix[b.rating]?.[p]?.max ?? 0} className={`${INPUT} w-20`} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 mt-4">
            <input type="checkbox" name="allow_above_max" defaultChecked={c.merit.allowAboveBandMax} /> Allow increases above the band maximum without flagging an exception
          </label>
        </Panel>

        <Panel title="Eligibility and bonus">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={LABEL}>Minimum score (%)</label>
              <input name="min_score" type="number" defaultValue={c.eligibility.minScorePct} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Minimum service (months)</label>
              <input name="min_service" type="number" defaultValue={c.eligibility.minServiceMonths} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Default target bonus (% of base)</label>
              <input name="bonus_target" type="number" step="0.1" defaultValue={c.bonus.defaultTargetPct} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Bonus cap (% of target)</label>
              <input name="bonus_cap" type="number" defaultValue={c.bonus.capPctOfTarget} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Manager discretion (± %)</label>
              <input name="bonus_discretion" type="number" defaultValue={c.bonus.discretionPct} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Round money to (decimals)</label>
              <input name="rounding" type="number" min="0" max="2" defaultValue={c.roundingDecimals} className={INPUT} />
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              <input type="checkbox" name="require_confirmed" defaultChecked={c.eligibility.requireConfirmed} /> Exclude employees still on probation
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200">
              <input type="checkbox" name="block_discipline" defaultChecked={c.eligibility.blockOnOpenDiscipline} /> Hold rewards while a disciplinary case is open
            </label>
          </div>
        </Panel>

        <div>
          <button className={BTN}>Save as a new version</button>
        </div>
      </ActionForm>

      <Panel title="Versions">
        <ul className="text-sm divide-y divide-[var(--border-subtle)]">
          {(versions ?? []).map((v) => (
            <li key={v.id} className="py-2 flex justify-between">
              <span className="text-neutral-800 dark:text-neutral-100">v{v.version} · {v.name}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{usedIds.has(v.id as string) ? "In use — read-only" : "Not used yet"} · {String(v.created_at).slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
