import type { SupabaseClient } from "@supabase/supabase-js";

// Universal Approval Engine — dynamic approver resolution (Area 02 spec §5).
// Never hard-code a user id into an approval_definition_steps row; resolve
// it at submission time from the organisation hierarchy instead, so a
// manager change or reorg doesn't require editing every definition.
//
// approval_steps can only carry ONE of approver_user_id (a specific person)
// or approver_role (any user holding that role) — so resolution returns a
// discriminated result rather than a plain id, and the caller (start-approval
// .ts) writes whichever field matches.
export type ApproverType =
  | "REQUESTER_MANAGER"
  | "SECOND_LEVEL_MANAGER"
  | "DEPARTMENT_HEAD"
  | "BUSINESS_UNIT_HEAD"
  | "HR_ROLE"
  | "SPECIFIC_ROLE"
  | "SPECIFIC_USER"
  | "POSITION_HOLDER"
  | "GROUP"
  | "COMMITTEE"
  | "AUTO";

export type ResolvedApprover =
  | { kind: "user"; userId: string }
  | { kind: "role"; role: string }
  | { kind: "auto" };

export class ApproverResolutionError extends Error {}

export async function resolveApprover(
  supabase: SupabaseClient,
  input: {
    requesterId: string; // app_users.id of the person who submitted the request
    approverType: ApproverType;
    approverValue?: string | null;
    orgId: string;
  }
): Promise<ResolvedApprover> {
  const { requesterId, approverType, approverValue, orgId } = input;

  switch (approverType) {
    case "REQUESTER_MANAGER": {
      const managerEmployeeId = await resolveRequesterManagerEmployeeId(supabase, requesterId);
      return { kind: "user", userId: await requireAppUserForEmployee(supabase, managerEmployeeId, "The requester's manager") };
    }

    case "SECOND_LEVEL_MANAGER": {
      const managerEmployeeId = await resolveRequesterManagerEmployeeId(supabase, requesterId);
      const { data: manager } = await supabase
        .from("employees")
        .select("reporting_manager_id")
        .eq("id", managerEmployeeId)
        .maybeSingle();
      if (!manager?.reporting_manager_id) {
        throw new ApproverResolutionError("The requester's manager has no manager of their own on file.");
      }
      return { kind: "user", userId: await requireAppUserForEmployee(supabase, manager.reporting_manager_id, "The second-level manager") };
    }

    case "DEPARTMENT_HEAD": {
      const employee = await requireRequesterEmployee(supabase, requesterId);
      const headEmployeeId = await resolveUnitHead(supabase, orgId, "department", employee.department);
      return { kind: "user", userId: await requireAppUserForEmployee(supabase, headEmployeeId, "The department head") };
    }

    case "BUSINESS_UNIT_HEAD": {
      const employee = await requireRequesterEmployee(supabase, requesterId);
      // Resolved via the department's parent organisation_units row (a
      // business_unit-type unit) — employees don't carry a business_unit
      // column of their own, only department.
      const { data: deptUnit } = await supabase
        .from("organisation_units")
        .select("parent_id")
        .eq("org_id", orgId)
        .eq("unit_type", "department")
        .eq("name", employee.department)
        .maybeSingle();
      if (!deptUnit?.parent_id) {
        throw new ApproverResolutionError(
          `No business-unit parent is configured for the "${employee.department}" department in the organisation hierarchy (Settings → Branches/Org Structure).`
        );
      }
      const { data: buUnit } = await supabase
        .from("organisation_units")
        .select("head_employee_id, unit_type")
        .eq("id", deptUnit.parent_id)
        .maybeSingle();
      if (!buUnit || buUnit.unit_type !== "business_unit" || !buUnit.head_employee_id) {
        throw new ApproverResolutionError("No business unit head is configured in the organisation hierarchy.");
      }
      return { kind: "user", userId: await requireAppUserForEmployee(supabase, buUnit.head_employee_id, "The business unit head") };
    }

    case "POSITION_HOLDER": {
      if (!approverValue) throw new ApproverResolutionError("POSITION_HOLDER requires a position id (approver_value).");
      const { data: holder } = await supabase
        .from("employee_positions")
        .select("employee_id")
        .eq("position_id", approverValue)
        .is("effective_to", null)
        .maybeSingle();
      if (!holder?.employee_id) {
        throw new ApproverResolutionError("No employee currently holds the configured position.");
      }
      return { kind: "user", userId: await requireAppUserForEmployee(supabase, holder.employee_id, "The position holder") };
    }

    case "HR_ROLE":
      return { kind: "role", role: "hr" };

    case "SPECIFIC_ROLE":
      if (!approverValue) throw new ApproverResolutionError("SPECIFIC_ROLE requires a role (approver_value).");
      return { kind: "role", role: approverValue };

    case "SPECIFIC_USER":
      if (!approverValue) throw new ApproverResolutionError("SPECIFIC_USER requires a user id (approver_value).");
      return { kind: "user", userId: approverValue };

    case "AUTO":
      return { kind: "auto" };

    case "GROUP":
    case "COMMITTEE":
      // No multi-approver (any-of/all-of) concept exists in approval_steps
      // today — one step is decided by one decision. Building that is
      // explicitly out of scope for this foundation pass (Implementation
      // Boundary §22: make the engine reliable and reusable first).
      throw new ApproverResolutionError(
        `${approverType} approvers are not supported yet — approval_steps has no multi-approver model to resolve into.`
      );

    default: {
      const exhaustive: never = approverType;
      throw new ApproverResolutionError(`Unsupported approver type: ${exhaustive}`);
    }
  }
}

async function requireRequesterEmployee(supabase: SupabaseClient, requesterId: string) {
  const { data: requesterAppUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", requesterId)
    .maybeSingle();
  if (!requesterAppUser?.employee_id) {
    throw new ApproverResolutionError("The requester has no linked employee record.");
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("id, department, reporting_manager_id")
    .eq("id", requesterAppUser.employee_id)
    .maybeSingle();
  if (!employee) throw new ApproverResolutionError("The requester's employee record was not found.");
  return employee;
}

async function resolveRequesterManagerEmployeeId(supabase: SupabaseClient, requesterId: string): Promise<string> {
  const employee = await requireRequesterEmployee(supabase, requesterId);
  if (!employee.reporting_manager_id) {
    throw new ApproverResolutionError("The requester has no reporting manager on file.");
  }
  return employee.reporting_manager_id;
}

async function resolveUnitHead(
  supabase: SupabaseClient,
  orgId: string,
  unitType: "department" | "business_unit" | "team",
  unitName: string
): Promise<string> {
  const { data: unit } = await supabase
    .from("organisation_units")
    .select("head_employee_id")
    .eq("org_id", orgId)
    .eq("unit_type", unitType)
    .eq("name", unitName)
    .maybeSingle();
  if (!unit?.head_employee_id) {
    throw new ApproverResolutionError(
      `No ${unitType.replace("_", " ")} head is configured for "${unitName}" in the organisation hierarchy (Settings → Branches/Org Structure).`
    );
  }
  return unit.head_employee_id;
}

async function requireAppUserForEmployee(supabase: SupabaseClient, employeeId: string, label: string): Promise<string> {
  const { data: appUser } = await supabase.from("app_users").select("id").eq("employee_id", employeeId).maybeSingle();
  if (!appUser) {
    throw new ApproverResolutionError(`${label} doesn't have a system login yet, so they can't be assigned as an approver.`);
  }
  return appUser.id;
}

// Every user eligible to decide a role-based step, for fan-out
// notifications (approval.step_assigned) — resolution itself only needs
// the role string (approval_steps.approver_role covers "anyone with this
// role" at decision time via RLS), but notifying requires actual recipients.
export async function resolveUsersByRole(supabase: SupabaseClient, orgId: string, role: string): Promise<string[]> {
  const { data } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", role);
  return (data ?? []).map((u) => u.id as string);
}
