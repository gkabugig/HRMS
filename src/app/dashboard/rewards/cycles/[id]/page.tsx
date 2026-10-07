import { notFound } from "next/navigation";
import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { advanceCycle, createPool, raisePool } from "@/lib/rewards/setup-actions";
import { generateRecommendations } from "@/lib/rewards/calculate-actions";
import { submitAllOpen } from "@/lib/rewards/review-actions";
import RecTable, { type RecRow } from "../../rec-table";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, Meter, PageHead, Panel, StatusChip, kes } from "../../ui";

const NEXT: Record<string, string> = { Planning: "Open the cycle to managers", Open: "Move to calibration", Calibration: "Move to approval", Approval: "Finalise the cycle" };

export default async function CyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; status?: string }> }) {
  const { id } = await params;
  const { type, status } = await searchParams;
  const { supabase, orgId, role } = await getRewardContext();
  const isHr = role === "admin" || role === "hr";

  const { data: cycle } = await supabase.from("reward_cycles").select("*").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!cycle) notFound();

  let q = supabase.from("reward_recommendations").select("*").eq("cycle_id", id).order("created_at");
  if (type) q = q.eq("reward_type", type);
  if (status) q = q.eq("status", status);
  const [{ data: recs }, { data: pools }, { data: policy }] = await Promise.all([
    q,
    supabase.from("reward_pool_status").select("*").eq("cycle_id", id),
    supabase.from("reward_policies").select("version, name").eq("id", cycle.policy_id).maybeSingle(),
  ]);
  const rows = (recs ?? []) as unknown as RecRow[];
  const counts = (recs ?? []).reduce<Record<string, number>>((a, r) => ((a[r.status as string] = (a[r.status as string] ?? 0) + 1), a), {});

  return (
    <div className="space-y-6">
      <PageHead title={cycle.name as string} subtitle={`${cycle.period_start} → ${cycle.period_end} · effective ${cycle.effective_date} · reads "${cycle.performance_cycle}" · policy v${policy?.version ?? "?"} · company factor ${cycle.company_factor}`} role={role} current="/dashboard/rewards" />

      <Panel
        title="Cycle progress"
        right={<StatusChip status={cycle.status as string} />}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} className="text-xs text-neutral-600 dark:text-neutral-300">
              <StatusChip status={s} /> <span className="ml-1">{n}</span>
            </span>
          ))}
          {rows.length === 0 && <span className="text-xs text-neutral-500 dark:text-neutral-400">No recommendations calculated yet.</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {isHr && (
            <ActionForm action={generateRecommendations.bind(null, id)} successMessage="Recommendations calculated." resetOnSuccess={false}>
              <button className={BTN}>{(recs ?? []).length ? "Recalculate recommendations" : "Calculate recommendations"}</button>
            </ActionForm>
          )}
          <ActionForm action={submitAllOpen.bind(null, id)} successMessage="All open recommendations submitted for approval." resetOnSuccess={false}>
            <button className={BTN_GHOST}>Submit all open for approval</button>
          </ActionForm>
          {isHr && NEXT[cycle.status as string] && (
            <ActionForm action={advanceCycle.bind(null, id)} successMessage="Cycle moved on." resetOnSuccess={false}>
              <button className={BTN_GHOST}>{NEXT[cycle.status as string]}</button>
            </ActionForm>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">Only completed (locked) appraisals are read. Your own record is never calculated for you; another approver handles it.</p>
      </Panel>

      <Panel title="Pools" subtitle="Approved budget against what is recommended.">
        {(pools ?? []).length === 0 ? (
          <Empty>No pools for this cycle yet.</Empty>
        ) : (
          <ul className="space-y-4">
            {(pools ?? []).map((p) => (
              <li key={p.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">
                    {p.name} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {p.pool_type}</span>
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {kes(p.committed)} of {kes(p.approved_budget)} · {kes(p.remaining)} left
                  </span>
                </div>
                <Meter used={Number(p.committed)} total={Number(p.approved_budget)} />
                {isHr && Number(p.remaining) < 0 && (
                  <ActionForm action={raisePool.bind(null, p.id as string)} successMessage="Pool budget changed." className="flex flex-wrap items-end gap-2 mt-2">
                    <div>
                      <label className={LABEL}>New budget (KES)</label>
                      <input name="approved_budget" type="number" min="0" required className={INPUT} />
                    </div>
                    <div className="flex-1 min-w-48">
                      <label className={LABEL}>Reason</label>
                      <input name="reason" required className={INPUT} />
                    </div>
                    <button className={BTN}>Raise pool</button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isHr && (
          <ActionForm action={createPool} successMessage="Pool created." className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <input type="hidden" name="cycle_id" value={id} />
            <div>
              <label className={LABEL}>Pool name</label>
              <input name="name" required placeholder="Merit 2026" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Type</label>
              <select name="pool_type" className={INPUT}>
                <option value="merit">Merit (annual cost)</option>
                <option value="bonus">Bonus</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Budget (KES)</label>
              <input name="approved_budget" type="number" min="0" required className={INPUT} />
            </div>
            <div className="flex items-end">
              <button className={BTN}>Add pool</button>
            </div>
          </ActionForm>
        )}
      </Panel>

      <Panel
        title="Recommendations"
        right={
          <div className="flex flex-wrap gap-1.5 text-xs">
            {["", "merit", "bonus"].map((t) => (
              <a key={t} href={`?${new URLSearchParams({ ...(t ? { type: t } : {}), ...(status ? { status } : {}) })}`} className={`rounded-full px-2.5 py-1 border ${((type ?? "") === t) ? "bg-brand-600 text-white border-brand-600" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300"}`}>
                {t === "" ? "All" : t === "merit" ? "Merit" : "Bonus"}
              </a>
            ))}
            {["Open", "In Review", "Finalised", "Rejected"].map((s) => (
              <a key={s} href={`?${new URLSearchParams({ ...(type ? { type } : {}), ...(status === s ? {} : { status: s }) })}`} className={`rounded-full px-2.5 py-1 border ${status === s ? "bg-neutral-800 text-white border-neutral-800" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300"}`}>
                {s}
              </a>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? <Empty>Nothing matches yet.</Empty> : <RecTable rows={rows} />}
      </Panel>
    </div>
  );
}
