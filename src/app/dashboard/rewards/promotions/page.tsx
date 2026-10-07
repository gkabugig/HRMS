import Link from "next/link";
import { getRewardContext, todayIso } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { openPromotionCase } from "@/lib/rewards/promotion-actions";
import { buildCandidates } from "@/lib/rewards/promotion-data";
import { BTN, Empty, INPUT, LABEL, PageHead, Panel, StatusChip, kes } from "../ui";

export default async function PromotionsPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (!["admin", "hr", "manager"].includes(role)) return <Empty>Promotions are managed by managers and HR.</Empty>;
  const today = todayIso();
  const [cands, { data: grades }, { data: cases }, { data: live }] = await Promise.all([
    buildCandidates(supabase, orgId, { asOf: today }),
    supabase.from("compensation_grades").select("id, name").eq("org_id", orgId),
    supabase.from("promotion_cases").select("id, employee_id, current_title, proposed_title, proposed_salary, readiness_score, readiness_label, status, effective_date, assessment").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("promotion_cases").select("employee_id").eq("org_id", orgId).in("status", ["Draft", "In Review", "Approved"]),
  ]);
  const gradeName = new Map((grades ?? []).map((g) => [g.id as string, g.name as string]));
  const liveIds = new Set((live ?? []).map((l) => l.employee_id as string));
  const open = cands.filter((c) => !liveIds.has(c.employeeId));
  const ready = open.filter((c) => c.allPassed);
  const notYet = open.filter((c) => !c.allPassed);
  const isHr = role === "admin" || role === "hr";

  return (
    <div className="space-y-6">
      <PageHead title="Promotions" subtitle="Everyone must pass the hard gates first. Then a readiness score ranks them, and the case goes through approval." role={role} current="/dashboard/rewards/promotions" />
      {isHr && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/dashboard/rewards/promotions/rules" className="text-brand-600 underline">Set the promotion rules</Link> for each grade step (gates, uplift, score weights).
        </p>
      )}

      <Panel title={`Eligible now (${ready.length})`} subtitle="Passed every gate. Open a case to assess readiness and propose the new role.">
        {ready.length === 0 ? (
          <Empty>{cands.length === 0 ? "No promotion rules apply yet — HR sets them under Rules." : "Nobody has passed all the gates right now."}</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {ready.map((c) => (
              <li key={c.employeeId} className="py-3">
                <details>
                  <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                      {c.name} <span className="text-xs text-neutral-500 font-normal">· {c.staffNo} · {c.jobTitle} · {gradeName.get(c.fromGradeId) ?? "?"} → {gradeName.get(c.rule.to_grade_id) ?? "?"}</span>
                    </span>
                    <span className="text-xs text-neutral-500">Avg performance {Math.round(c.avgPerformancePct)}% · {c.monthsInGrade} months in grade</span>
                  </summary>
                  <ActionForm action={openPromotionCase} successMessage="Case opened — find it in the list below." className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <input type="hidden" name="employee_id" value={c.employeeId} />
                    <input type="hidden" name="rule_id" value={c.rule.id} />
                    <div className="col-span-2">
                      <label className={LABEL}>New job title</label>
                      <input name="proposed_title" required className={INPUT} />
                    </div>
                    <div className="col-span-2">
                      <label className={LABEL}>Effective date</label>
                      <input name="effective_date" type="date" required defaultValue={today} className={INPUT} />
                    </div>
                    {([["competencies", "Competencies"], ["qualifications", "Qualifications"], ["leadership", "Leadership"], ["values", "Values"]] as const).map(([n, l]) => (
                      <div key={n}>
                        <label className={LABEL}>{l} (0–100)</label>
                        <input name={n} type="number" min="0" max="100" required className={INPUT} />
                      </div>
                    ))}
                    <div className="col-span-2 sm:col-span-4">
                      <label className={LABEL}>Why this person, why now?</label>
                      <textarea name="justification" required rows={2} className={INPUT} />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <button className={BTN}>Open promotion case</button>
                    </div>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {notYet.length > 0 && (
        <Panel title={`Not eligible yet (${notYet.length})`} subtitle="What is still missing.">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {notYet.map((c) => (
              <li key={c.employeeId} className="py-2.5">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{c.name} <span className="text-xs text-neutral-500 font-normal">· {c.jobTitle}</span></p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{c.gates.filter((g) => !g.passed).map((g) => `${g.label}: ${g.detail}`).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Promotion cases">
        {(cases ?? []).length === 0 ? (
          <Empty>No cases yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(cases ?? []).map((c) => (
              <li key={c.id as string} className="py-2.5 flex items-center justify-between gap-3">
                <Link href={`/dashboard/rewards/promotions/${c.id}`} className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                    {(c.assessment as { employeeName?: string })?.employeeName ?? "Employee"}: {c.current_title ?? "—"} → {c.proposed_title as string}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{kes(c.proposed_salary)} a month · effective {c.effective_date as string} · readiness {c.readiness_score ?? "—"} ({c.readiness_label as string})</p>
                </Link>
                <StatusChip status={c.status as string} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
