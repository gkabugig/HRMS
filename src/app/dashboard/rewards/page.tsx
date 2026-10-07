import Link from "next/link";
import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { createDefaultPolicy, createPool, createRewardCycle } from "@/lib/rewards/setup-actions";
import { StatCard, StatGrid } from "../components/role-home";
import { BTN, INPUT, LABEL, Empty, Meter, PageHead, Panel, StatusChip, kes } from "./ui";

export default async function RewardsHome() {
  const { supabase, orgId, role } = await getRewardContext();
  const isHr = role === "admin" || role === "hr";
  if (!isHr && role !== "manager") return <Empty>The rewards workspace is for HR and line managers. Your own rewards are under My Rewards.</Empty>;

  const [{ data: cycles }, { data: pools }, { data: recs }, { data: policies }, { data: perfCycles }] = await Promise.all([
    supabase.from("reward_cycles").select("id, name, status, period_start, period_end, effective_date, performance_cycle").eq("org_id", orgId).order("created_at", { ascending: false }),
    supabase.from("reward_pool_status").select("*").eq("org_id", orgId),
    supabase.from("reward_recommendations").select("status, reward_type, recommended_amount, is_exception").eq("org_id", orgId),
    isHr ? supabase.from("reward_policies").select("id, version, name").eq("org_id", orgId).order("version", { ascending: false }) : Promise.resolve({ data: [] }),
    isHr ? supabase.from("appraisals").select("cycle") : Promise.resolve({ data: [] }),
  ]);

  const list = recs ?? [];
  const inReview = list.filter((r) => r.status === "In Review").length;
  const exceptions = list.filter((r) => r.is_exception && ["Open", "In Review"].includes(r.status as string)).length;
  const committed = list.filter((r) => ["Finalised", "Paid"].includes(r.status as string)).reduce((s, r) => s + Number(r.recommended_amount), 0);
  const open = list.filter((r) => r.status === "Open").length;
  const performanceCycles = [...new Set((perfCycles ?? []).map((p) => p.cycle as string))];

  return (
    <div className="space-y-6">
      <PageHead title="Rewards & Merit" subtitle="Performance → recommendation → calibration → approval → payroll. Nothing is paid until it is approved." role={role} current="/dashboard/rewards" />

      <StatGrid>
        <StatCard index={0} label="Waiting for review" value={open} note="Open recommendations" href="/dashboard/rewards/recommendations" />
        <StatCard index={1} label="Awaiting approval" value={inReview} noteTone={inReview > 0 ? "warn" : "good"} note="In the approvals inbox" href="/dashboard/approvals" />
        <StatCard index={2} label="Exceptions" value={exceptions} noteTone={exceptions > 0 ? "warn" : "good"} note="Outside range or cap" href="/dashboard/rewards/recommendations" />
        <StatCard index={3} label="Approved to date" value={kes(committed)} note="Merit counted per year" href="/dashboard/rewards/history" />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Reward cycles" subtitle="Each cycle reads one completed performance cycle.">
          {(cycles ?? []).length === 0 ? (
            <Empty>No reward cycle yet.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {(cycles ?? []).map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <Link href={`/dashboard/rewards/cycles/${c.id}`} className="text-sm font-medium text-neutral-900 dark:text-neutral-50 hover:text-brand-600">
                    {c.name}
                    <span className="block text-xs font-normal text-neutral-500 dark:text-neutral-400">
                      {c.period_start} → {c.period_end} · effective {c.effective_date}
                    </span>
                  </Link>
                  <StatusChip status={c.status as string} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Pools and budgets" subtitle="Committed and remaining are calculated from recommendations.">
          {(pools ?? []).length === 0 ? (
            <Empty>No pools yet. Create them inside a cycle.</Empty>
          ) : (
            <ul className="space-y-3">
              {(pools ?? []).map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900 dark:text-neutral-50">
                      {p.name} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {p.pool_type}</span>
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      {kes(p.committed)} of {kes(p.approved_budget)}
                    </span>
                  </div>
                  <Meter used={Number(p.committed)} total={Number(p.approved_budget)} />
                  {Number(p.remaining) < 0 && <p className="text-[11px] text-red-600 mt-1">Over budget by {kes(Math.abs(Number(p.remaining)))}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {isHr && (policies ?? []).length === 0 && (
        <Panel title="Start here: reward policy" subtitle="The policy holds score bands, the merit matrix, eligibility and bonus rules. You can edit every figure after creating it.">
          <ActionForm action={createDefaultPolicy} successMessage="Default policy created.">
            <button className={BTN}>Create the default policy</button>
          </ActionForm>
        </Panel>
      )}

      {isHr && (policies ?? []).length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="New reward cycle">
            <ActionForm action={createRewardCycle} successMessage="Cycle created." className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={LABEL}>Name</label>
                <input name="name" required placeholder="2026 Annual Merit and Bonus Review" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Review period starts</label>
                <input name="period_start" type="date" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Review period ends</label>
                <input name="period_end" type="date" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Effective date</label>
                <input name="effective_date" type="date" required className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Company / team factor</label>
                <input name="company_factor" type="number" step="0.001" min="0" defaultValue="1" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Performance review cycle</label>
                <input name="performance_cycle" required list="perf-cycles" placeholder="as named in Performance" className={INPUT} />
                <datalist id="perf-cycles">
                  {performanceCycles.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={LABEL}>Policy</label>
                <select name="policy_id" className={INPUT}>
                  {(policies ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      v{p.version} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <button className={BTN}>Create cycle</button>
              </div>
            </ActionForm>
          </Panel>

          <Panel title="Standalone pool" subtitle="For spot awards and incentive schemes that are not tied to a cycle.">
            <ActionForm action={createPool} successMessage="Pool created." className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Name</label>
                <input name="name" required placeholder="Spot awards 2026" className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Type</label>
                <select name="pool_type" className={INPUT}>
                  <option value="spot">Spot awards</option>
                  <option value="incentive">Incentives</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Approved budget (KES)</label>
                <input name="approved_budget" type="number" min="0" required className={INPUT} />
              </div>
              <div className="col-span-2">
                <button className={BTN}>Create pool</button>
              </div>
            </ActionForm>
          </Panel>
        </div>
      )}
    </div>
  );
}
