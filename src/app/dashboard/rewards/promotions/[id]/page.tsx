import Link from "next/link";
import { notFound } from "next/navigation";
import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { deferPromotionCase, reassessPromotionCase, submitPromotionCase } from "@/lib/rewards/promotion-actions";
import type { Gate } from "@/lib/rewards/promotion-engine";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, PageHead, Panel, StatusChip, kes } from "../../ui";

const PART_LABEL: Record<string, string> = { performance: "Performance", competencies: "Competencies", experience: "Experience", qualifications: "Qualifications", leadership: "Leadership", values: "Values" };

export default async function PromotionCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, role } = await getRewardContext();
  if (!["admin", "hr", "manager"].includes(role)) return <Empty>Promotions are managed by managers and HR.</Empty>;
  const { data: c } = await supabase.from("promotion_cases").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!c) notFound();
  const a = (c.assessment ?? {}) as Record<string, unknown> & { parts?: Record<string, number>; employeeName?: string; department?: string; avgPerformancePct?: number; monthsInGrade?: number };
  const gates = (c.gate_results ?? []) as Gate[];
  const isHr = role === "admin" || role === "hr";
  const draft = c.status === "Draft";
  const val = (k: string) => Number(a[k] ?? 0);

  return (
    <div className="space-y-6">
      <PageHead title={`Promotion: ${a.employeeName ?? "Employee"}`} subtitle={`${c.current_title ?? "—"} → ${c.proposed_title} · effective ${c.effective_date}`} role={role} current="/dashboard/rewards/promotions" />
      <p className="text-xs"><Link href="/dashboard/rewards/promotions" className="text-brand-600 underline">← All promotions</Link></p>

      <div className="grid sm:grid-cols-3 gap-4">
        <Panel title="Status"><StatusChip status={c.status} /><p className="text-xs text-neutral-500 mt-2">{c.decision_reason ?? ""}</p></Panel>
        <Panel title="Readiness"><p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{c.readiness_score ?? "—"}</p><p className="text-xs text-neutral-500">{c.readiness_label}</p></Panel>
        <Panel title="Pay"><p className="text-sm text-neutral-900 dark:text-neutral-50">{kes(c.current_salary)} → <b>{kes(c.proposed_salary)}</b></p><p className="text-xs text-neutral-500">a month, basic</p></Panel>
      </div>

      <Panel title="Gates" subtitle="Hard requirements, checked when the case was opened or last reassessed.">
        <ul className="space-y-1.5">
          {gates.map((g) => (
            <li key={g.key} className="text-sm flex gap-2">
              <span>{!g.checked ? "◌" : g.passed ? "✓" : "✗"}</span>
              <span className="text-neutral-900 dark:text-neutral-50">{g.label}</span>
              <span className="text-xs text-neutral-500 self-center">{g.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Readiness breakdown" subtitle="Points each factor contributes to the score.">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {Object.entries(a.parts ?? {}).map(([k, v]) => (
            <div key={k}>
              <p className="text-[11px] text-neutral-500">{PART_LABEL[k] ?? k}</p>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{Number(v).toFixed(1)}</p>
            </div>
          ))}
        </div>
        {c.justification && <p className="text-sm text-neutral-700 dark:text-neutral-200 mt-4"><b>Justification:</b> {c.justification}</p>}
        {c.development_plan && <p className="text-sm text-neutral-700 dark:text-neutral-200 mt-2"><b>Development plan:</b> {c.development_plan}</p>}
      </Panel>

      {draft && (
        <>
          <Panel title="Revise the assessment" subtitle="Saving re-checks the gates and recalculates the score and salary.">
            <ActionForm action={reassessPromotionCase.bind(null, id)} successMessage="Reassessed." resetOnSuccess={false} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-4">
                <label className={LABEL}>New job title</label>
                <input name="proposed_title" defaultValue={c.proposed_title} className={INPUT} />
              </div>
              {(["competencies", "qualifications", "leadership", "values"] as const).map((k) => (
                <div key={k}>
                  <label className={LABEL}>{PART_LABEL[k]} (0–100)</label>
                  <input name={k} type="number" min="0" max="100" defaultValue={val(k)} className={INPUT} />
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4">
                <label className={LABEL}>Justification</label>
                <textarea name="justification" rows={2} defaultValue={c.justification ?? ""} className={INPUT} />
              </div>
              <div className="col-span-2 sm:col-span-4"><button className={BTN_GHOST}>Save and recalculate</button></div>
            </ActionForm>
          </Panel>
          <Panel title="Send for approval" subtitle="HR checks it, then the head of the organisation decides. Whoever opens a case never approves it.">
            <ActionForm action={submitPromotionCase.bind(null, id)} successMessage="Submitted for approval." resetOnSuccess={false}>
              <button className={BTN}>Submit for approval</button>
            </ActionForm>
          </Panel>
        </>
      )}

      {isHr && ["Draft", "In Review"].includes(c.status) && (
        <Panel title="Defer with a development plan" subtitle="Not this time. The plan is kept so the next cycle starts from it.">
          <ActionForm action={deferPromotionCase.bind(null, id)} successMessage="Case deferred." resetOnSuccess={false} className="space-y-3">
            <textarea name="development_plan" rows={3} required className={INPUT} />
            <button className={BTN_GHOST}>Defer</button>
          </ActionForm>
        </Panel>
      )}

      {c.letter_text && (
        <Panel title="Promotion letter">
          <pre className="whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-100 font-sans">{c.letter_text}</pre>
        </Panel>
      )}
    </div>
  );
}
