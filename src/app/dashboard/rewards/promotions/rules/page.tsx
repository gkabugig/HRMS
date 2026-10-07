import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { removePromotionRule, savePromotionRule } from "@/lib/rewards/promotion-actions";
import { mergeRule } from "@/lib/rewards/promotion-data";
import { DEFAULT_PROMOTION_RULE as D } from "@/lib/rewards/promotion-engine";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, PageHead, Panel } from "../../ui";

export default async function PromotionRulesPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Promotion rules are managed by HR.</Empty>;
  const [{ data: grades }, { data: rules }] = await Promise.all([
    supabase.from("compensation_grades").select("id, name").eq("org_id", orgId).order("order_rank"),
    supabase.from("promotion_rules").select("id, from_grade_id, to_grade_id, config").eq("org_id", orgId).eq("is_active", true),
  ]);
  const gname = new Map((grades ?? []).map((g) => [g.id as string, g.name as string]));
  const num = (name: string, label: string, v: number, step = "1") => (
    <div>
      <label className={LABEL}>{label}</label>
      <input name={name} type="number" step={step} defaultValue={v} className={INPUT} />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHead title="Promotion rules" subtitle="One rule per grade step. Saving the same step again replaces its rule." role={role} current="/dashboard/rewards/promotions" />
      <Panel title="Rules in force">
        {(rules ?? []).length === 0 ? (
          <Empty>No rules yet. Add the first one below.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(rules ?? []).map((r) => {
              const c = mergeRule(r.config);
              return (
                <li key={r.id as string} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{gname.get(r.from_grade_id as string)} → {gname.get(r.to_grade_id as string)}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">≥{c.minPerformancePct}% in last {c.performanceCycles} cycles · {c.minMonthsInGrade} months in grade · {c.upliftPct}% uplift{c.requireVacancy ? " · vacancy required" : ""}</p>
                  </div>
                  <ActionForm action={removePromotionRule.bind(null, r.id as string)} successMessage="Rule removed.">
                    <button className={BTN_GHOST}>Remove</button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Add or replace a rule">
        <ActionForm action={savePromotionRule} successMessage="Rule saved." resetOnSuccess={false} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(["from_grade_id", "to_grade_id"] as const).map((n) => (
              <div key={n}>
                <label className={LABEL}>{n === "from_grade_id" ? "Promote from grade" : "Promote to grade"}</label>
                <select name={n} required className={INPUT}>
                  <option value="">Choose…</option>
                  {(grades ?? []).map((g) => <option key={g.id as string} value={g.id as string}>{g.name as string}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Gates (must all pass)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            {num("min_perf", "Minimum performance (%)", D.minPerformancePct)}
            {num("perf_cycles", "In each of last … cycles", D.performanceCycles)}
            {num("min_months", "Months in current grade", D.minMonthsInGrade)}
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 pb-2"><input type="checkbox" name="require_vacancy" /> A vacancy must exist</label>
          </div>
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Pay</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{num("uplift", "Promotion uplift (%)", D.upliftPct, "0.5")}</div>
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Readiness score weights (total 100%)</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {num("w_performance", "Performance", D.weights.performance)}
            {num("w_competencies", "Competencies", D.weights.competencies)}
            {num("w_experience", "Experience", D.weights.experience)}
            {num("w_qualifications", "Qualifications", D.weights.qualifications)}
            {num("w_leadership", "Leadership", D.weights.leadership)}
            {num("w_values", "Values", D.weights.values)}
          </div>
          <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Score cut-offs</p>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {num("cut_strong", "Strongly recommended ≥", D.cutoffs.stronglyRecommended)}
            {num("cut_rec", "Recommended ≥", D.cutoffs.recommended)}
            {num("cut_dev", "Development needed ≥", D.cutoffs.developmentNeeded)}
          </div>
          <button className={BTN}>Save rule</button>
        </ActionForm>
      </Panel>
    </div>
  );
}
