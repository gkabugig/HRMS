import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { addActuals, approveActuals, createScheme, toggleScheme } from "@/lib/rewards/setup-actions";
import { calculateScheme } from "@/lib/rewards/calculate-actions";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, PageHead, Panel, kes } from "../ui";

const TYPES = [
  ["sales", "Sales commission"],
  ["project", "Project incentive"],
  ["team", "Team incentive"],
  ["retention", "Retention bonus"],
  ["referral", "Referral incentive"],
  ["long_service", "Long-service award"],
];

function describe(c: Record<string, any>): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const parts: string[] = [];
  if (c.payout === "flat") parts.push(`flat ${kes(c.amount)}`);
  if (c.payout === "pct_of_salary") parts.push(`${c.pct}% of salary`);
  if (c.payout === "pct_of_result") parts.push(`${c.pct}% of result`);
  if (c.payout === "tiered") parts.push(`tiered (${(c.tiers ?? []).length} slabs)`);
  if (c.threshold) parts.push(`from ${Number(c.threshold).toLocaleString("en-KE")}`);
  if (c.cap != null) parts.push(`cap ${kes(c.cap)}`);
  if (c.floor != null) parts.push(`floor ${kes(c.floor)}`);
  return parts.join(" · ");
}

export default async function SchemesPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Incentive schemes are managed by HR.</Empty>;
  const [{ data: schemes }, { data: pools }, { data: actuals }] = await Promise.all([
    supabase.from("reward_schemes").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
    supabase.from("reward_pools").select("id, name, pool_type").eq("org_id", orgId).in("pool_type", ["incentive", "bonus", "spot"]),
    supabase.from("scheme_actuals").select("scheme_id, period, status").eq("org_id", orgId),
  ]);
  const periodsFor = (id: string) => {
    const m = new Map<string, { pending: number; approved: number }>();
    for (const a of actuals ?? []) {
      if (a.scheme_id !== id) continue;
      const e = m.get(a.period as string) ?? { pending: 0, approved: 0 };
      e[a.status === "approved" ? "approved" : "pending"]++;
      m.set(a.period as string, e);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  };

  return (
    <div className="space-y-6">
      <PageHead title="Incentive schemes" subtitle="Build a scheme once. Each period: add results, HR approves them, then the engine calculates the payouts." role={role} current="/dashboard/rewards/schemes" />

      <Panel title="New scheme">
        <ActionForm action={createScheme} successMessage="Scheme created." className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Name</label>
            <input name="name" required placeholder="Quarterly sales commission" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Type</label>
            <select name="scheme_type" className={INPUT}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Period</label>
            <select name="period" className={INPUT}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Metric measured</label>
            <input name="metric" placeholder="Sales value (KES)" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Payout rule</label>
            <select name="payout" className={INPUT}>
              <option value="pct_of_result">Percentage of result</option>
              <option value="pct_of_salary">Percentage of salary</option>
              <option value="flat">Flat amount</option>
              <option value="tiered">Tiered slabs</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Percentage (%)</label>
            <input name="pct" type="number" step="0.01" min="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Flat amount (KES)</label>
            <input name="amount" type="number" min="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Threshold (minimum result)</label>
            <input name="threshold" type="number" min="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Cap per person (KES)</label>
            <input name="cap" type="number" min="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Floor per person (KES)</label>
            <input name="floor" type="number" min="0" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Tiers (one per line: from-to:percent)</label>
            <textarea name="tiers" rows={2} placeholder={"0-100000:2\n100000-:5"} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Only these departments (comma-separated, blank = everyone)</label>
            <input name="departments" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Pool</label>
            <select name="pool_id" className={INPUT}>
              <option value="">No pool</option>
              {(pools ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button className={BTN}>Create scheme</button>
          </div>
        </ActionForm>
      </Panel>

      {(schemes ?? []).length === 0 ? (
        <Panel>
          <Empty>No schemes yet.</Empty>
        </Panel>
      ) : (
        (schemes ?? []).map((s) => (
          <Panel
            key={s.id as string}
            title={`${s.name}${s.is_active ? "" : " (off)"}`}
            subtitle={`${String(s.scheme_type).replace("_", " ")} · ${s.period} · ${describe(s.config as Record<string, never>)}`}
            right={
              <ActionForm action={toggleScheme.bind(null, s.id as string)} successMessage={null} resetOnSuccess={false}>
                <button className={BTN_GHOST}>{s.is_active ? "Switch off" : "Switch on"}</button>
              </ActionForm>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActionForm action={addActuals.bind(null, s.id as string)} successMessage="Results saved (waiting for HR approval)." className="space-y-2">
                <label className={LABEL}>Add results — one per line: staff number, result</label>
                <input name="period" placeholder="Period, e.g. 2026-10" className={INPUT} required />
                <textarea name="lines" rows={3} placeholder={"E014, 850000\nE022, 1200000"} className={INPUT} />
                <button className={BTN_GHOST}>Save results</button>
              </ActionForm>

              <div className="space-y-3">
                <label className={LABEL}>Periods</label>
                {periodsFor(s.id as string).length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">No results yet.</p>
                ) : (
                  periodsFor(s.id as string).map(([period, n]) => (
                    <div key={period} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-neutral-900 dark:text-neutral-50 w-20">{period}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">{n.pending} pending · {n.approved} approved</span>
                      {n.pending > 0 && (
                        <ActionForm action={approveActuals.bind(null, s.id as string)} successMessage="Approved." resetOnSuccess={false}>
                          <input type="hidden" name="period" value={period} />
                          <button className={BTN_GHOST}>Approve results</button>
                        </ActionForm>
                      )}
                      {n.approved > 0 && (
                        <ActionForm action={calculateScheme.bind(null, s.id as string)} successMessage="Payouts calculated. See Recommendations." resetOnSuccess={false}>
                          <input type="hidden" name="period" value={period} />
                          <button className={BTN}>Calculate payouts</button>
                        </ActionForm>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
