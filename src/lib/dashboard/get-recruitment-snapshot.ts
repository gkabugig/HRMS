// Recruitment Snapshot (spec §10). Open requisitions + candidate funnel,
// scoped to the org via requisitions.org_id (candidates hang off
// requisition_id, RLS already joins through it).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardContext, RecruitmentSnapshot } from "./dashboard-types";

export async function getRecruitmentSnapshot(
  supabase: SupabaseClient,
  context: DashboardContext
): Promise<RecruitmentSnapshot> {
  const { data: openReqs } = await supabase
    .from("requisitions")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("status", "Open");

  const reqIds = (openReqs ?? []).map((r) => r.id);
  if (reqIds.length === 0) {
    return { visible: true, openPositions: 0, candidates: 0, screening: 0, interviews: 0, offers: 0, hires: 0 };
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select("stage")
    .in("requisition_id", reqIds);

  const rows = candidates ?? [];
  return {
    visible: true,
    openPositions: reqIds.length,
    candidates: rows.length,
    screening: rows.filter((c) => c.stage === "Screened" || c.stage === "Shortlisted").length,
    interviews: rows.filter((c) => c.stage === "Interviewed").length,
    offers: rows.filter((c) => c.stage === "Offered").length,
    hires: rows.filter((c) => c.stage === "Hired").length,
  };
}
