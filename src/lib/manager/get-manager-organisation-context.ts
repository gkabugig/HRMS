// Area 06 §19 "Organisation Context" — where the manager sits: their own
// manager, their position/department, and their direct reports. Explicitly
// NOT the full admin organogram (Area 04's organisation-unit tree editor) —
// spec's Implementation Boundary excludes Position & Workforce Planning, so
// this stays a simple read of the manager's own place in the authoritative
// reporting_relationships graph, reusing getCurrentManager/getDirectReports
// rather than building a second resolver.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentManager } from "@/lib/organisation/get-current-manager";

export type ManagerOrganisationContext = {
  self: { id: string; name: string; jobTitle: string; department: string };
  ownManager: { id: string; name: string; jobTitle: string } | null;
  directReports: { id: string; name: string; jobTitle: string }[];
};

export async function getManagerOrganisationContext(
  supabase: SupabaseClient,
  managerEmployeeId: string,
  directReportIds: string[]
): Promise<ManagerOrganisationContext> {
  const [{ data: self }, ownManagerId, { data: reports }] = await Promise.all([
    supabase.from("employees").select("id, name, job_title, department").eq("id", managerEmployeeId).single(),
    getCurrentManager(supabase, managerEmployeeId),
    directReportIds.length > 0
      ? supabase.from("employees").select("id, name, job_title").in("id", directReportIds).order("name")
      : Promise.resolve({ data: [] }),
  ]);

  let ownManager: ManagerOrganisationContext["ownManager"] = null;
  if (ownManagerId) {
    const { data: m } = await supabase.from("employees").select("id, name, job_title").eq("id", ownManagerId).maybeSingle();
    if (m) ownManager = { id: m.id, name: m.name, jobTitle: m.job_title };
  }

  return {
    self: { id: self!.id, name: self!.name, jobTitle: self!.job_title, department: self!.department },
    ownManager,
    directReports: (reports ?? []).map((r) => ({ id: r.id, name: r.name, jobTitle: r.job_title })),
  };
}
