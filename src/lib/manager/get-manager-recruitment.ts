// Area 06 §13 "Recruitment Workspace" — requisitions the manager raised/owns
// as hiring manager, and candidates in their pipeline. Relies entirely on
// the existing "requisitions_manager_own" and "candidates_manager_read" RLS
// policies (0002) — both already scope by hiring_manager_id =
// current_employee_id(), so this reads with no employeeIds filter at all
// (recruitment scope is hiring-manager-based, not direct-reports-based,
// per spec §13: "scoped to requisitions where the manager is the hiring
// manager of record"). onboarding_tasks has no manager RLS policy (HR-only
// by design), so onboarding checklists are intentionally not surfaced here.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagerRequisition = {
  id: string;
  role: string;
  department: string;
  headcount: number;
  status: string;
  raisedOn: string;
  candidates: { id: string; name: string; stage: string; source: string | null; addedOn: string }[];
};

export type ManagerRecruitmentData = {
  requisitions: ManagerRequisition[];
  openRequisitionCount: number;
  candidatesInPipeline: number;
};

export async function getManagerRecruitment(supabase: SupabaseClient): Promise<ManagerRecruitmentData> {
  const { data: requisitions } = await supabase
    .from("requisitions")
    .select("id, role, department, headcount, status, raised_on, candidates(id, name, stage, source, added_on)")
    .order("raised_on", { ascending: false });

  const rows = (requisitions ?? []) as unknown as {
    id: string;
    role: string;
    department: string;
    headcount: number;
    status: string;
    raised_on: string;
    candidates: { id: string; name: string; stage: string; source: string | null; added_on: string }[] | null;
  }[];

  const mapped: ManagerRequisition[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    department: r.department,
    headcount: r.headcount,
    status: r.status,
    raisedOn: r.raised_on,
    candidates: (r.candidates ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      source: c.source,
      addedOn: c.added_on,
    })),
  }));

  return {
    requisitions: mapped,
    openRequisitionCount: mapped.filter((r) => r.status === "Open").length,
    candidatesInPipeline: mapped.reduce((sum, r) => sum + r.candidates.filter((c) => c.stage !== "Hired" && c.stage !== "Rejected").length, 0),
  };
}
