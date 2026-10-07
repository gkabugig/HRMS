import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { nominateSpotAward } from "@/lib/rewards/review-actions";
import { BTN, Empty, INPUT, LABEL, PageHead, Panel, StatusChip, kes } from "../ui";

export default async function SpotPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (!["admin", "hr", "manager"].includes(role)) return <Empty>Spot awards are nominated by managers and HR.</Empty>;
  const [{ data: pools }, { data: awards }] = await Promise.all([
    supabase.from("reward_pool_status").select("id, name, remaining").eq("org_id", orgId).eq("pool_type", "spot"),
    supabase.from("reward_recommendations").select("id, status, recommended_amount, justification, snapshot, created_at").eq("org_id", orgId).eq("reward_type", "spot").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="space-y-6">
      <PageHead title="Spot awards" subtitle="Recognise a one-off contribution. HR approves; it is paid in the next pay run." role={role} current="/dashboard/rewards/spot" />
      <Panel title="Nominate">
        <ActionForm action={nominateSpotAward} successMessage="Nominated and sent for approval." className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={LABEL}>Staff number</label>
            <input name="staff_no" required className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Amount (KES)</label>
            <input name="amount" type="number" min="1" required className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Pool</label>
            <select name="pool_id" className={INPUT}>
              <option value="">No pool</option>
              {(pools ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {kes(p.remaining)} left</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={LABEL}>What is it for?</label>
            <textarea name="reason" required rows={2} className={INPUT} />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <button className={BTN}>Nominate</button>
          </div>
        </ActionForm>
      </Panel>
      <Panel title="Recent awards">
        {(awards ?? []).length === 0 ? (
          <Empty>No spot awards yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(awards ?? []).map((a) => (
              <li key={a.id as string} className="py-2.5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{(a.snapshot as { employeeName?: string })?.employeeName} — {kes(a.recommended_amount)}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{a.justification}</p>
                </div>
                <StatusChip status={a.status as string} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
