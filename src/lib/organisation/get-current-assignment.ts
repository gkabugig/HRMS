import type { SupabaseClient } from "@supabase/supabase-js";

// Area 04 §13 — the authoritative read for "what position/unit/location/
// cost-centre is this employee in right now". Backed by
// employee_current_org_view (supabase/migrations/0057, security_invoker as
// of 0061), so it returns exactly what the calling client's own RLS would
// let it see on employees/employee_positions/positions — nothing more.
//
// Only covers "as of today" (the view itself is defined with
// current_date), matching how every current caller needs it (UI, RBAC,
// workflow task/approver resolution). A historical "as of a past date"
// resolver would need a parameterised RPC instead of a plain view; nothing
// in this pass needs that, so it isn't built — see getCurrentManager for the
// one place an arbitrary "as of" date IS needed and how that's handled via
// the SQL function directly instead of this view.
export type CurrentAssignment = {
  employeeId: string;
  orgId: string;
  positionId: string;
  positionCode: string | null;
  positionTitle: string;
  approvedHeadcount: number;
  organisationUnitId: string | null;
  organisationUnitName: string | null;
  unitType: "business_unit" | "department" | "team" | null;
  locationId: string | null;
  locationName: string | null;
  costCentreId: string | null;
  costCentreName: string | null;
  currentManagerId: string | null;
  effectiveFrom: string;
};

export async function getCurrentAssignment(
  supabase: SupabaseClient,
  employeeId: string
): Promise<CurrentAssignment | null> {
  const { data, error } = await supabase
    .from("employee_current_org_view")
    .select(
      "employee_id, org_id, position_id, position_code, position_title, approved_headcount, organisation_unit_id, organisation_unit_name, unit_type, location_id, location_name, cost_centre_id, cost_centre_name, current_manager_id, assignment_effective_from"
    )
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    employeeId: data.employee_id,
    orgId: data.org_id,
    positionId: data.position_id,
    positionCode: data.position_code,
    positionTitle: data.position_title,
    approvedHeadcount: data.approved_headcount,
    organisationUnitId: data.organisation_unit_id,
    organisationUnitName: data.organisation_unit_name,
    unitType: data.unit_type,
    locationId: data.location_id,
    locationName: data.location_name,
    costCentreId: data.cost_centre_id,
    costCentreName: data.cost_centre_name,
    currentManagerId: data.current_manager_id,
    effectiveFrom: data.assignment_effective_from,
  };
}
