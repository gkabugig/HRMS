"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// Organisation Hierarchy (Phase 2 spec §5) — additive alongside
// employees.department/reporting_manager_id, which every existing page
// still reads. These actions only manage the new organisation_units/
// locations/cost_centres/positions/employee_positions layer.
async function requireOrgAndActor(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only admin/HR can manage the organisation structure.");
  }
  return { orgId: appUser.org_id as string, userId: user.id };
}

export async function createOrgUnit(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireOrgAndActor(supabase);

  const name = String(formData.get("name") || "");
  const unitType = String(formData.get("unit_type") || "department");
  const parentId = String(formData.get("parent_id") || "") || null;
  if (!name) throw new Error("Name is required.");

  const { data, error } = await supabase
    .from("organisation_units")
    .insert({ org_id: orgId, name, unit_type: unitType, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "org_unit.created",
    resourceType: "organisation_unit",
    resourceId: data.id,
    eventCategory: "configuration",
    after: { name, unitType, parentId },
  });

  revalidatePath("/dashboard/organogram");
}

export async function deleteOrgUnit(id: string) {
  const supabase = await createClient();
  const { orgId, userId } = await requireOrgAndActor(supabase);
  const { error } = await supabase.from("organisation_units").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "org_unit.deleted",
    resourceType: "organisation_unit",
    resourceId: id,
    eventCategory: "configuration",
  });
  revalidatePath("/dashboard/organogram");
}

export async function createLocation(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireOrgAndActor(supabase);
  const name = String(formData.get("name") || "");
  if (!name) throw new Error("Name is required.");
  const { error } = await supabase.from("locations").insert({
    org_id: orgId,
    name,
    address: String(formData.get("address") || "") || null,
    is_remote: formData.get("is_remote") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/organogram");
}

export async function createCostCentre(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireOrgAndActor(supabase);
  const code = String(formData.get("code") || "");
  const name = String(formData.get("name") || "");
  if (!code || !name) throw new Error("Code and name are required.");
  const { error } = await supabase.from("cost_centres").insert({ org_id: orgId, code, name });
  if (error) {
    if (error.code === "23505") throw new Error("That cost centre code is already in use.");
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/organogram");
}

export async function createPosition(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireOrgAndActor(supabase);

  const title = String(formData.get("title") || "");
  if (!title) throw new Error("Title is required.");

  const { data, error } = await supabase
    .from("positions")
    .insert({
      org_id: orgId,
      title,
      organisation_unit_id: String(formData.get("organisation_unit_id") || "") || null,
      location_id: String(formData.get("location_id") || "") || null,
      cost_centre_id: String(formData.get("cost_centre_id") || "") || null,
      reports_to_position_id: String(formData.get("reports_to_position_id") || "") || null,
      approved_headcount: Number(formData.get("approved_headcount") || 1),
      position_code: String(formData.get("position_code") || "") || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "position.created",
    resourceType: "position",
    resourceId: data.id,
    eventCategory: "configuration",
    after: { title },
  });

  revalidatePath("/dashboard/organogram");
}

// Links an employee to a position — and, authoritative as of Area 04,
// optionally changes their line manager in the same action. Delegates to
// change_employee_assignment() (supabase/migrations/0059), the single
// transactional path for every assignment change: it closes out the
// previous employee_positions/reporting_relationships rows (never rewrites
// history), flips position statuses, keeps employees.department/
// reporting_manager_id in sync for every reader that hasn't migrated onto
// the resolvers/view yet, and records both a domain event and an audit
// event. Admin/HR only — enforced inside the function itself, independent
// of this action's own RLS-scoped client.
export async function assignEmployeePosition(formData: FormData) {
  const supabase = await createClient();
  await requireOrgAndActor(supabase);

  const employeeId = String(formData.get("employee_id") || "");
  const positionId = String(formData.get("position_id") || "");
  const managerId = String(formData.get("manager_id") || "") || null;
  const reason = String(formData.get("reason") || "") || null;
  const effectiveFrom = String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10);
  if (!employeeId || !positionId) throw new Error("Employee and position are required.");

  const { error } = await supabase.rpc("change_employee_assignment", {
    p_employee_id: employeeId,
    p_position_id: positionId,
    p_manager_id: managerId,
    p_effective_from: effectiveFrom,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/organogram");
  revalidatePath(`/dashboard/employees/${employeeId}`);
}

// Marks a position active/inactive (spec §8 "retire instead of hard-delete
// when history exists") — a position with assignment history can't be
// cleanly removed, so this is the primary way to close one out instead of
// deleteOrgUnit-style hard deletion.
export async function setPositionActive(positionId: string, isActive: boolean) {
  const supabase = await createClient();
  const { orgId, userId } = await requireOrgAndActor(supabase);

  const { error } = await supabase
    .from("positions")
    .update({ is_active: isActive })
    .eq("id", positionId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: isActive ? "position.reactivated" : "position.retired",
    resourceType: "position",
    resourceId: positionId,
    eventCategory: "configuration",
  });

  revalidatePath("/dashboard/organogram");
}

// Runs the Area 04 data-quality checks (spec §27/§28) and refreshes the
// findings shown on the organogram page. Thin wrapper over the SQL function
// so every finding is computed in one transactional pass server-side.
export async function runOrganisationDataQuality() {
  const supabase = await createClient();
  await requireOrgAndActor(supabase);

  const { data, error } = await supabase.rpc("run_organisation_data_quality");
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/organogram");
  return data as number;
}
