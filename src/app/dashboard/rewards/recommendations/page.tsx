import { getRewardContext } from "@/lib/rewards/context";
import RecTable, { type RecRow } from "../rec-table";
import { Empty, PageHead, Panel } from "../ui";

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { supabase, orgId, role } = await getRewardContext();
  let q = supabase.from("reward_recommendations").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(300);
  q = status ? q.eq("status", status) : q.in("status", ["Open", "In Review", "Rejected"]);
  const { data } = await q;
  const rows = (data ?? []) as unknown as RecRow[];
  return (
    <div className="space-y-6">
      <PageHead title="Reward recommendations" subtitle={role === "manager" ? "Your direct reports only." : "Everything waiting for review, approval or a decision."} role={role} current="/dashboard/rewards/recommendations" />
      <Panel>{rows.length === 0 ? <Empty>No recommendations waiting.</Empty> : <RecTable rows={rows} />}</Panel>
    </div>
  );
}
