import type { SupabaseClient } from "@supabase/supabase-js";

// Area 04 §20 — the nested hierarchy behind the organogram's Hierarchy tab.
// Reads organisation_units/positions/employee_positions with the caller's
// own RLS-scoped client (no admin client here), so "Enforce Area 01 scope/
// RLS" (spec's own wording) falls out for free: organisation_units/positions
// are read_all (any org member), employee_positions is restricted to self/
// manager/hr (0023_phase2_foundation.sql) — a plain employee therefore sees
// the shape of the hierarchy but not full occupancy counts elsewhere in the
// org, which is the existing (pre-Area-04) boundary, not a new one.
export type OrgTreeNode = {
  id: string;
  name: string;
  unitType: "business_unit" | "department" | "team";
  isActive: boolean;
  parentId: string | null;
  employeeCount: number;
  positionCount: number;
  vacancyCount: number;
  children: OrgTreeNode[];
};

export async function getOrgTree(supabase: SupabaseClient, orgId: string): Promise<OrgTreeNode[]> {
  const [{ data: units, error: unitsError }, { data: positions, error: positionsError }] = await Promise.all([
    supabase
      .from("organisation_units")
      .select("id, name, unit_type, parent_id, is_active")
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("positions")
      .select("id, organisation_unit_id, approved_headcount")
      .eq("org_id", orgId),
  ]);
  if (unitsError) throw new Error(unitsError.message);
  if (positionsError) throw new Error(positionsError.message);

  const positionIds = (positions ?? []).map((p) => p.id);
  let occupiedByPosition = new Map<string, number>();
  if (positionIds.length > 0) {
    const { data: openAssignments, error: epError } = await supabase
      .from("employee_positions")
      .select("position_id")
      .in("position_id", positionIds)
      .eq("is_primary", true)
      .is("effective_to", null);
    // A non-admin/hr/manager caller may not have read access to every row
    // here (employee_positions RLS is self/manager/hr-scoped) — treat that
    // as "unknown occupancy" rather than failing the whole tree.
    if (!epError && openAssignments) {
      occupiedByPosition = openAssignments.reduce((map, row) => {
        map.set(row.position_id, (map.get(row.position_id) ?? 0) + 1);
        return map;
      }, new Map<string, number>());
    }
  }

  const nodeById = new Map<string, OrgTreeNode>();
  for (const unit of units ?? []) {
    nodeById.set(unit.id, {
      id: unit.id,
      name: unit.name,
      unitType: unit.unit_type,
      isActive: unit.is_active,
      parentId: unit.parent_id,
      employeeCount: 0,
      positionCount: 0,
      vacancyCount: 0,
      children: [],
    });
  }

  for (const position of positions ?? []) {
    if (!position.organisation_unit_id) continue;
    const node = nodeById.get(position.organisation_unit_id);
    if (!node) continue;
    const occupied = occupiedByPosition.get(position.id) ?? 0;
    node.positionCount += 1;
    node.employeeCount += occupied;
    node.vacancyCount += Math.max(0, position.approved_headcount - occupied);
  }

  const roots: OrgTreeNode[] = [];
  for (const node of nodeById.values()) {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
