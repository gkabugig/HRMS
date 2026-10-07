"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
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


// The data-quality check treats someone as "unassigned" when their position
// has no organisation unit (get_current_assignment_unit returns null). So make
// sure the position is linked to a unit — the employee's department, created
// if it doesn't exist yet.
async function ensurePositionHasUnit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  positionId: string,
  employeeId: string
) {
  const { data: position } = await supabase.from("positions").select("organisation_unit_id").eq("id", positionId).maybeSingle();
  if (!position || position.organisation_unit_id) return;
  const { data: emp } = await supabase.from("employees").select("department").eq("id", employeeId).maybeSingle();
  const dept = (emp?.department as string | null)?.trim();
  if (!dept) return;
  let { data: unit } = await supabase
    .from("organisation_units")
    .select("id")
    .eq("org_id", orgId)
    .eq("unit_type", "department")
    .eq("name", dept)
    .maybeSingle();
  if (!unit) {
    const { data: created, error } = await supabase
      .from("organisation_units")
      .insert({ org_id: orgId, name: dept, unit_type: "department" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    unit = created;
  }
  await supabase.from("positions").update({ organisation_unit_id: unit!.id }).eq("id", positionId);
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

export async function createPosition(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
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
  });
}

// Sets (or clears) the cost centre of an existing position — clears the
// "Occupied position has no cost centre" data-quality finding.
export async function setPositionCostCentre(positionId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { orgId, userId } = await requireOrgAndActor(supabase);
    const costCentreId = String(formData.get("cost_centre_id") || "") || null;
    const { error } = await supabase
      .from("positions")
      .update({ cost_centre_id: costCentreId })
      .eq("id", positionId)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    await recordAuditEvent(supabase, {
      orgId,
      actorUserId: userId,
      action: "position.cost_centre_set",
      resourceType: "position",
      resourceId: positionId,
      eventCategory: "configuration",
      after: { cost_centre_id: costCentreId },
    });
    revalidatePath("/dashboard/organogram");
  });
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
export async function assignEmployeePosition(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  await requireOrgAndActor(supabase);

  const employeeId = String(formData.get("employee_id") || "");
  const positionId = String(formData.get("position_id") || "");
  const managerId = String(formData.get("manager_id") || "") || null;
  const reason = String(formData.get("reason") || "") || null;
  const effectiveFrom = String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10);
  if (!employeeId || !positionId) throw new Error("Employee and position are required.");

  const { orgId: assignOrgId } = await requireOrgAndActor(supabase);
  await ensurePositionHasUnit(supabase, assignOrgId, positionId, employeeId);

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
  });
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
export async function runOrganisationDataQuality(_prev?: FormResult, _formData?: FormData): Promise<FormResult> {
  void _prev;
  void _formData;
  return toResult(async () => {
    const supabase = await createClient();
    await requireOrgAndActor(supabase);

    const { error } = await supabase.rpc("run_organisation_data_quality");
    if (error) throw new Error(`Run checks failed: ${error.message}`);

    revalidatePath("/dashboard/organogram");
  });
}

// One-step fix used from the data-quality panel: give an employee a position
// (existing, or a new one created from a typed title) and optionally a manager,
// then re-run the checks so the finding list is up to date straight away.
export async function quickFixAssignment(employeeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { orgId, userId } = await requireOrgAndActor(supabase);

    let positionId = String(formData.get("position_id") || "");
    const newTitle = String(formData.get("new_position_title") || "").trim();
    const managerId = String(formData.get("manager_id") || "") || null;

    // Already assigned (e.g. an earlier attempt succeeded but its position had
    // no department, so the check kept flagging it): repair that assignment
    // instead of trying to assign again.
    const { data: current } = await supabase
      .from("employee_positions")
      .select("position_id")
      .eq("employee_id", employeeId)
      .eq("is_primary", true)
      .is("effective_to", null)
      .maybeSingle();

    if (current?.position_id && !positionId && !newTitle) {
      await ensurePositionHasUnit(supabase, orgId, current.position_id as string, employeeId);
    } else {
      if (!positionId && !newTitle) throw new Error("Choose a position, or type a title to create a new one.");
      if (!positionId) {
        const { data: created, error: posErr } = await supabase
          .from("positions")
          .insert({ org_id: orgId, title: newTitle, approved_headcount: 1 })
          .select("id")
          .single();
        if (posErr) throw new Error(posErr.message);
        positionId = created.id;
        await recordAuditEvent(supabase, {
          orgId, actorUserId: userId, action: "position.created", resourceType: "position",
          resourceId: positionId, eventCategory: "configuration", after: { title: newTitle },
        });
      }
      await ensurePositionHasUnit(supabase, orgId, positionId, employeeId);

      const { error } = await supabase.rpc("change_employee_assignment", {
        p_employee_id: employeeId,
        p_position_id: positionId,
        p_manager_id: managerId,
        p_effective_from: new Date().toISOString().slice(0, 10),
        p_reason: "Data-quality quick fix",
      });
      if (error) throw new Error(error.message);
    }

    await supabase.rpc("run_organisation_data_quality");
    revalidatePath("/dashboard/organogram");
    revalidatePath(`/dashboard/employees/${employeeId}`);
  });
}

// Marks an employee as the head of the organisation (no manager by design;
// their requests go to the HR Manager) and re-runs the checks.
export async function markHeadOfOrganisation(employeeId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  void _formData;
  return toResult(async () => {
    const supabase = await createClient();
    const { orgId } = await requireOrgAndActor(supabase);
    const { error } = await supabase
      .from("employees")
      .update({ is_head_of_organisation: true })
      .eq("id", employeeId)
      .eq("org_id", orgId);
    if (error) {
      if (error.code === "23505") throw new Error("Another employee is already marked as the head of the organisation.");
      if (/is_head_of_organisation|column/i.test(error.message)) {
        throw new Error("The database update for 'head of organisation' hasn't been applied yet. Run the 0136 SQL in Supabase, then try again.");
      }
      throw new Error(error.message);
    }
    await supabase.rpc("run_organisation_data_quality");
    revalidatePath("/dashboard/organogram");
    revalidatePath(`/dashboard/employees/${employeeId}`);
  });
}
