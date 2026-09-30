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
      headcount_approved: Number(formData.get("headcount_approved") || 1),
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

// Links an employee to a position, effective-dated (spec §5.3 — history is
// never rewritten, only closed out and superseded). Also flips the old
// primary position's status back to vacant and the new one to occupied so
// headcount reporting stays accurate.
export async function assignEmployeePosition(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireOrgAndActor(supabase);

  const employeeId = String(formData.get("employee_id") || "");
  const positionId = String(formData.get("position_id") || "");
  const reason = String(formData.get("reason") || "") || null;
  if (!employeeId || !positionId) throw new Error("Employee and position are required.");

  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from("employee_positions")
    .update({ effective_to: today })
    .eq("employee_id", employeeId)
    .eq("is_primary", true)
    .is("effective_to", null);

  const { error } = await supabase.from("employee_positions").insert({
    employee_id: employeeId,
    position_id: positionId,
    effective_from: today,
    is_primary: true,
    reason,
  });
  if (error) throw new Error(error.message);

  await supabase.from("positions").update({ status: "occupied" }).eq("id", positionId).eq("org_id", orgId);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "employee.position_assigned",
    resourceType: "employee_position",
    resourceId: employeeId,
    eventCategory: "data",
    after: { employeeId, positionId, reason },
  });

  revalidatePath("/dashboard/organogram");
  revalidatePath(`/dashboard/employees/${employeeId}`);
}
