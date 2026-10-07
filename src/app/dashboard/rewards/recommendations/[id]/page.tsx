import { notFound } from "next/navigation";
import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { amendRecommendation } from "@/lib/rewards/approval-actions";
import { adjustRecommendation, reopenRecommendation, submitRecommendation } from "@/lib/rewards/review-actions";
import { BTN, BTN_GHOST, INPUT, LABEL, PageHead, Panel, StatusChip, kes } from "../../ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
function Line({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0 ${strong ? "font-semibold text-neutral-900 dark:text-neutral-50" : "text-neutral-700 dark:text-neutral-200"}`}>
      <span className="text-sm text-neutral-500 dark:text-neutral-400 font-normal">{k}</span>
      <span className="text-sm tabular-nums text-right">{v}</span>
    </div>
  );
}

export default async function RecommendationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, role, employeeId } = await getRewardContext();
  const { data: rec } = await supabase.from("reward_recommendations").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!rec) notFound();
  const { data: events } = await supabase.from("reward_audit_events").select("event, reason, created_at").eq("record_id", id).order("created_at", { ascending: false }).limit(20);

  const s = (rec.snapshot ?? {}) as Record<string, any>;
  const excluded = s.eligibility?.result === "excluded";
  const editable = ["Draft", "Open"].includes(rec.status as string) && !excluded && rec.employee_id !== employeeId && ["admin", "hr", "manager"].includes(role);
  const isMerit = rec.reward_type === "merit";
  const isHr = role === "admin" || role === "hr";

  return (
    <div className="space-y-6">
      <PageHead title={`${s.employeeName ?? "Employee"} — ${String(rec.reward_type).replace("_", " ")}`} subtitle={`${s.department ?? ""}${s.grade ? ` · ${s.grade}` : ""}`} role={role} current="/dashboard/rewards/recommendations" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="How this was calculated" right={<StatusChip status={excluded ? "Draft" : (rec.status as string)} />}>
          {excluded ? (
            <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-2">
              <p className="font-medium">Not eligible for this cycle.</p>
              <ul className="list-disc pl-5 text-neutral-600 dark:text-neutral-300">{(s.eligibility?.reasons ?? []).map((r: string) => <li key={r}>{r}</li>)}</ul>
              {s.eligibility?.missingEvidence && <p className="text-xs text-amber-700">Missing evidence: complete and lock the appraisal, then recalculate.</p>}
            </div>
          ) : isMerit ? (
            <div>
              <Line k="Current monthly salary" v={kes(s.salary)} />
              <Line k="Performance score" v={s.scorePct != null ? `${s.scorePct}% — ${s.rating}` : "—"} />
              <Line k="Position in band" v={s.bandMin != null ? `${s.position} (${s.rangeRatio ? Math.round(s.rangeRatio * 100) : "?"}% of midpoint; band ${kes(s.bandMin)}–${kes(s.bandMax)})` : "No band set for this grade"} />
              <Line k="Matrix range" v={s.merit?.cell ? `${s.merit.cell.min}–${s.merit.cell.max}%` : "—"} />
              <Line k="Proposed (middle of range)" v={`${s.merit?.proposedPct ?? 0}%`} />
              <Line k="Recommended increase" v={`${rec.pct}%`} strong />
              <Line k="New monthly salary" v={kes(rec.new_salary)} strong />
              <Line k="Annual cost" v={kes(rec.recommended_amount)} />
              {s.merit?.exceedsBandMax && <p className="text-xs text-amber-700 mt-2">This takes the salary above the top of the band, so it is an exception.</p>}
            </div>
          ) : s.bonus ? (
            <div>
              <Line k="Annual base salary" v={kes(s.bonus.annualBase)} />
              <Line k={`Target bonus (${s.bonus.targetPct}%)`} v={kes(s.bonus.targetBonus)} />
              <Line k={`Performance factor (${s.rating})`} v={s.performanceFactor} />
              <Line k="Company / team factor" v={s.companyFactor} />
              <Line k="Eligibility factor" v={`${s.eligibility?.factor}${s.eligibility?.result === "prorated" ? " (prorated)" : ""}`} />
              <Line k="Before cap" v={kes(s.bonus.uncapped)} />
              <Line k="Cap" v={`${kes(s.bonus.cap)}${s.bonus.capped ? " — reached" : " — not reached"}`} />
              <Line k="Calculated bonus" v={kes(rec.calculated_amount)} strong />
              <Line k="Recommended" v={kes(rec.recommended_amount)} strong />
            </div>
          ) : s.scheme ? (
            <div>
              <Line k="Scheme" v={s.scheme} />
              <Line k="Period" v={s.period} />
              <Line k="Result achieved" v={Number(s.metricValue).toLocaleString("en-KE")} />
              <Line k="Payout rule" v={String(s.schemeConfig?.payout ?? "").replace(/_/g, " ")} />
              {s.payout?.belowThreshold && <Line k="Threshold" v="Not reached" />}
              {s.payout?.capped && <Line k="Cap" v="Applied" />}
              <Line k="Calculated" v={kes(rec.calculated_amount)} strong />
              <Line k="Recommended" v={kes(rec.recommended_amount)} strong />
            </div>
          ) : (
            <div>
              <Line k="Amount" v={kes(rec.recommended_amount)} strong />
              {s.reason && <Line k="Reason" v={s.reason} />}
            </div>
          )}
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-3">Calculated on the server from policy v{rec.policy_version ?? "—"}; the inputs above are the snapshot stored with this record.</p>
        </Panel>

        <div className="space-y-6">
          {editable && (
            <Panel title="Review" subtitle={isMerit ? "Move the percentage anywhere inside the matrix range without a reason." : "Stay inside the manager discretion range, or explain the exception."}>
              <ActionForm action={adjustRecommendation.bind(null, id)} successMessage="Saved." resetOnSuccess={false} className="space-y-3">
                {isMerit ? (
                  <div>
                    <label className={LABEL}>Increase (%)</label>
                    <input name="pct" type="number" step="0.1" min="0" max="50" defaultValue={Number(rec.pct ?? 0)} className={INPUT} />
                  </div>
                ) : (
                  <div>
                    <label className={LABEL}>Amount (KES)</label>
                    <input name="amount" type="number" step="1" min="0" defaultValue={Number(rec.recommended_amount)} className={INPUT} />
                  </div>
                )}
                <div>
                  <label className={LABEL}>Reason (needed for exceptions)</label>
                  <textarea name="justification" rows={3} defaultValue={(rec.justification as string | null) ?? ""} className={INPUT} />
                </div>
                <button className={BTN_GHOST}>Save changes</button>
              </ActionForm>
              {rec.status === "Open" && (
                <ActionForm action={submitRecommendation.bind(null, id)} successMessage="Submitted for approval." resetOnSuccess={false} className="mt-3">
                  <button className={BTN}>Submit for approval</button>
                </ActionForm>
              )}
              {rec.is_exception && <p className="text-xs text-amber-700 mt-3">This is an exception. It goes to HR and the head of the organisation.</p>}
            </Panel>
          )}

          {rec.status === "Rejected" && (
            <Panel title="Rejected">
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">This went back to the manager. HR can reopen it for another look.</p>
              {isHr && (
                <ActionForm action={reopenRecommendation.bind(null, id)} successMessage="Reopened." resetOnSuccess={false}>
                  <button className={BTN_GHOST}>Reopen for review</button>
                </ActionForm>
              )}
            </Panel>
          )}

          {rec.status === "Finalised" && isHr && (
            <Panel title="Amend after approval" subtitle="Reopens only this record, keeps the earlier version, and sends it through approval again. Possible until it reaches a pay run (or the salary change takes effect).">
              <ActionForm action={amendRecommendation.bind(null, id)} successMessage="Reopened for amendment." resetOnSuccess={false} className="space-y-2">
                <textarea name="reason" rows={2} required placeholder="Why is this being amended?" className={INPUT} />
                <button className={BTN_GHOST}>Amend</button>
              </ActionForm>
            </Panel>
          )}

          {rec.status === "In Review" && (
            <Panel title="With the approvers">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">Waiting in the approvals inbox. The person who recommends cannot approve, and nobody approves their own reward.</p>
            </Panel>
          )}

          <Panel title="Record history">
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-neutral-400 dark:text-neutral-500">No events yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(events ?? []).map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-neutral-700 dark:text-neutral-200">
                      {String(e.event).replace(/[._]/g, " ")}
                      {e.reason ? <span className="text-neutral-500 dark:text-neutral-400"> — {e.reason}</span> : null}
                    </span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">{String(e.created_at).slice(0, 16).replace("T", " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
