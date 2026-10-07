import { getRewardContext } from "@/lib/rewards/context";
import { Empty, PageHead, Panel } from "../ui";

export default async function RewardAuditPage() {
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>The reward audit log is for HR and auditors.</Empty>;
  const { data } = await supabase.from("reward_audit_events").select("id, event, record_type, reason, before_json, after_json, created_at, actor_user_id").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
  return (
    <div className="space-y-6">
      <PageHead title="Reward audit log" subtitle="Append-only: entries cannot be edited or deleted." role={role} current="/dashboard/rewards/audit" />
      <Panel>
        {(data ?? []).length === 0 ? (
          <Empty>No events yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(data ?? []).map((e) => (
              <li key={e.id as string} className="py-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-neutral-900 dark:text-neutral-50">{String(e.event).replace(/[._]/g, " ")} <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">· {String(e.record_type).replace(/_/g, " ")}</span></span>
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap">{String(e.created_at).slice(0, 16).replace("T", " ")}</span>
                </div>
                {e.reason && <p className="text-xs text-neutral-600 dark:text-neutral-300">Reason: {e.reason as string}</p>}
                {(e.before_json || e.after_json) && (
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono break-all">
                    {e.before_json ? `before ${JSON.stringify(e.before_json)} ` : ""}
                    {e.after_json ? `after ${JSON.stringify(e.after_json)}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
