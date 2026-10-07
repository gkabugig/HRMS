import type { SupabaseClient } from "@supabase/supabase-js";

// Gives an employee a current position so they stop showing up as
// "No current organisation assignment":
//  - reuses an active position with their job title that still has room
//    (preferring their own department), otherwise creates one;
//  - makes sure that position is linked to their department (the data-quality
//    check only counts a position that belongs to an organisation unit);
//  - records the assignment (change_employee_assignment, today).
// If they already have a current assignment it only repairs the department link.
export async function ensureDepartmentUnit(supabase: SupabaseClient, orgId: string, department: string): Promise<string | null> {
  const name = department.trim();
  if (!name) return null;
  const { data: found } = await supabase
    .from("organisation_units")
    .select("id")
    .eq("org_id", orgId)
    .eq("unit_type", "department")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (found) return found.id as string;
  const { data: created, error } = await supabase
    .from("organisation_units")
    .insert({ org_id: orgId, name, unit_type: "department" })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the "${name}" department: ${error.message}`);
  return created.id as string;
}

export async function autoAssignPosition(supabase: SupabaseClient, orgId: string, employeeId: string): Promise<string> {
  const { data: emp } = await supabase.from("employees").select("name, department, job_title").eq("id", employeeId).maybeSingle();
  if (!emp) throw new Error("Employee not found.");
  const unitId = await ensureDepartmentUnit(supabase, orgId, (emp.department as string) ?? "");

  const { data: current } = await supabase
    .from("employee_positions")
    .select("position_id")
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .is("effective_to", null)
    .maybeSingle();

  if (current?.position_id) {
    const { data: pos } = await supabase.from("positions").select("organisation_unit_id").eq("id", current.position_id).maybeSingle();
    if (pos && !pos.organisation_unit_id && unitId) {
      await supabase.from("positions").update({ organisation_unit_id: unitId }).eq("id", current.position_id);
      return `${emp.name}: linked their existing position to ${emp.department}.`;
    }
    return `${emp.name}: already has a position.`;
  }

  // Reuse a position with the same title that still has a free seat.
  const title = ((emp.job_title as string) || "Employee").trim();
  const { data: candidates } = await supabase
    .from("positions")
    .select("id, approved_headcount, organisation_unit_id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .ilike("title", title);
  let positionId: string | null = null;
  const ranked = [...(candidates ?? [])].sort(
    (a, b) => Number(b.organisation_unit_id === unitId) - Number(a.organisation_unit_id === unitId)
  );
  for (const c of ranked) {
    const { count } = await supabase
      .from("employee_positions")
      .select("id", { count: "exact", head: true })
      .eq("position_id", c.id)
      .eq("is_primary", true)
      .is("effective_to", null);
    if ((count ?? 0) < (c.approved_headcount ?? 1)) {
      positionId = c.id as string;
      break;
    }
  }
  if (!positionId) {
    const { data: created, error } = await supabase
      .from("positions")
      .insert({ org_id: orgId, title, organisation_unit_id: unitId, approved_headcount: 1 })
      .select("id")
      .single();
    if (error) throw new Error(`Could not create the "${title}" position: ${error.message}`);
    positionId = created.id as string;
  } else {
    const { data: pos } = await supabase.from("positions").select("organisation_unit_id").eq("id", positionId).maybeSingle();
    if (pos && !pos.organisation_unit_id && unitId) {
      await supabase.from("positions").update({ organisation_unit_id: unitId }).eq("id", positionId);
    }
  }

  const { error: rpcErr } = await supabase.rpc("change_employee_assignment", {
    p_employee_id: employeeId,
    p_position_id: positionId,
    p_manager_id: null,
    p_effective_from: new Date().toISOString().slice(0, 10),
    p_reason: "Automatic assignment",
  });
  if (rpcErr) throw new Error(rpcErr.message);
  return `${emp.name}: assigned to ${title}${emp.department ? ` (${emp.department})` : ""}.`;
}
