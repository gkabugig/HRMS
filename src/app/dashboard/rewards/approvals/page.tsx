import { getRewardContext } from "@/lib/rewards/context";
import ActionForm from "@/components/forms/action-form";
import { removeWorkflow, saveWorkflow } from "@/lib/rewards/approval-actions";
import { BTN, BTN_GHOST, Empty, INPUT, LABEL, PageHead, Panel, kes } from "../ui";

const STAGE_LABEL: Record<string, string> = { hr: "HR review", admin: "Administrator", head: "Head of organisation" };
const TYPES = ["*", "merit", "bonus", "incentive", "spot", "retention", "referral", "long_service"];

export default async function ApprovalChainsPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Approval chains are set by HR.</Empty>;
  const { data: list } = await supabase.from("reward_approval_workflows").select("*").eq("org_id", orgId).eq("is_active", true).order("created_at");
  return (
    <div className="space-y-6">
      <PageHead title="Approval chains" subtitle="Who approves what. With no chain set, HR approves, and exceptions also go to the head of the organisation." role={role} current="/dashboard/rewards/approvals" />
      <Panel title="Chains in force" subtitle="The most specific match wins: a named reward type beats “any”, then the higher minimum amount. A step left unactioned past its due days is escalated automatically, and approvers can delegate from the approvals inbox.">
        {(list ?? []).length === 0 ? (
          <Empty>No chains yet. The default applies.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(list ?? []).map((w) => (
              <li key={w.id as string} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{w.name as string}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {w.reward_type === "*" ? "Any reward" : String(w.reward_type).replace("_", " ")} · {kes(w.min_amount)}{w.max_amount !== null ? ` to ${kes(w.max_amount)}` : " and above"}{w.exceptions_only ? " · exceptions only" : ""} · {(w.stages as string[]).map((s) => STAGE_LABEL[s]).join(" → ")} · escalates after {w.due_days as number} day(s)
                  </p>
                </div>
                <ActionForm action={removeWorkflow.bind(null, w.id as string)} successMessage="Removed.">
                  <button className={BTN_GHOST}>Remove</button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Add a chain" subtitle="Amount means the recommended amount; for a merit increase, the annual cost.">
        <ActionForm action={saveWorkflow} successMessage="Chain added." className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2"><label className={LABEL}>Name</label><input name="name" required className={INPUT} placeholder="e.g. Large bonuses" /></div>
          <div><label className={LABEL}>Reward type</label><select name="reward_type" className={INPUT}>{TYPES.map((t) => <option key={t} value={t}>{t === "*" ? "Any" : t.replace("_", " ")}</option>)}</select></div>
          <div><label className={LABEL}>Escalate after (days)</label><input name="due_days" type="number" min="1" max="60" defaultValue={3} className={INPUT} /></div>
          <div><label className={LABEL}>From amount (KES)</label><input name="min_amount" type="number" min="0" defaultValue={0} className={INPUT} /></div>
          <div><label className={LABEL}>Up to (blank = no limit)</label><input name="max_amount" type="number" min="0" className={INPUT} /></div>
          <label className="col-span-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 self-end pb-2"><input type="checkbox" name="exceptions_only" /> Only for exceptions</label>
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <label className={LABEL}>Stage {n}{n === 1 ? "" : " (optional)"}</label>
              <select name={`stage_${n}`} required={n === 1} className={INPUT} defaultValue="">
                {n > 1 && <option value="">None</option>}
                {n === 1 && <option value="" disabled>Choose…</option>}
                {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4"><button className={BTN}>Add chain</button></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
