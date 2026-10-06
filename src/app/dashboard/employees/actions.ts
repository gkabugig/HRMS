"use server";

import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { revalidatePath } from "next/cache";

import { defaultProbationEndDate } from "@/lib/compliance";
import { logEmployeeChanges } from "@/lib/audit";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { startWorkflowRun, PRIORITY_WORKFLOW_KEYS } from "@/lib/workflows/start-workflow-run";
import { recordJobHistoryChange, recordCompensationHistoryChange } from "@/lib/employees/history";
import { createAppUserLogin, type AppRole } from "@/lib/auth/provision-user";
import { authorize } from "@/lib/authz/authorize";


export async function createEmployee(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();

  // Employees is one of the three resources the Universal RBAC rollout
  // enforces explicitly (spec §12's route-by-route migration pattern), on
  // top of the RESTRICTIVE RLS policies that are the real backstop. No
  // existing record yet, so this is the coarse "can create at all" check —
  // the same organisation-scope grant the employees_insert_rbac RLS policy
  // checks inline.
  const decision = await authorize(supabase, { resource: "employees", action: "create" });
  if (!decision.allowed) throw new Error("You do not have permission to add employees.");

  const dateOfHire = String(formData.get("date_of_hire") || "");
  const probationEndDate =
    String(formData.get("probation_end_date") || "") || defaultProbationEndDate(dateOfHire);

  const payload = {
    org_id: await requireOrgId(supabase),
    staff_no: String(formData.get("staff_no") || ""),
    name: String(formData.get("name") || ""),
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || "Permanent"),
    date_of_hire: dateOfHire,
    basic: Number(formData.get("basic") || 0),
    house_allowance: Number(formData.get("house_allowance") || 0),
    transport_allowance: Number(formData.get("transport_allowance") || 0),
    other_allowance: Number(formData.get("other_allowance") || 0),
    kra_pin: String(formData.get("kra_pin") || "") || null,
    nssf_no: String(formData.get("nssf_no") || "") || null,
    shif_no: String(formData.get("shif_no") || "") || null,
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
    branch_id: String(formData.get("branch_id") || "") || null,
    probation_end_date: probationEndDate,
    contract_issued_on: String(formData.get("contract_issued_on") || "") || null,
    date_of_birth: String(formData.get("date_of_birth") || "") || null,
    gender: String(formData.get("gender") || "") || null,
    marital_status: String(formData.get("marital_status") || "") || null,
    national_id: String(formData.get("national_id") || "") || null,
    passport_no: String(formData.get("passport_no") || "") || null,
    nationality: String(formData.get("nationality") || "") || null,
    personal_email: String(formData.get("personal_email") || "") || null,
    phone_number: String(formData.get("phone_number") || "") || null,
    physical_address: String(formData.get("physical_address") || "") || null,
    postal_address: String(formData.get("postal_address") || "") || null,
  };

  const { data: created, error } = await supabase.from("employees").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  const { data: { user: creator } } = await supabase.auth.getUser();
  await recordAuditEvent(supabase, {
    orgId: payload.org_id,
    actorUserId: creator?.id ?? null,
    action: "employee.created",
    resourceType: "employee",
    resourceId: created.id,
    eventCategory: "data",
    after: { staff_no: payload.staff_no, name: payload.name, department: payload.department },
  });
  await startWorkflowRun(supabase, {
    orgId: payload.org_id,
    key: PRIORITY_WORKFLOW_KEYS.ONBOARDING,
    entityType: "employee",
    entityId: created.id,
    tasks: [
      { task: "Issue written contract (s.10)", assigneeRole: "hr" },
      { task: "Set up payroll and statutory numbers", assigneeRole: "hr" },
      { task: "Provision system access", assigneeRole: "admin" },
    ],
  });

  // Seed the first job/compensation history rows so the Employee 360
  // History views aren't empty from day one.
  await supabase.from("employee_job_history").insert({
    employee_id: created.id,
    effective_from: dateOfHire,
    department: payload.department,
    job_title: payload.job_title,
    employment_type: payload.employment_type,
    manager_id: payload.reporting_manager_id,
    reason: "Hired",
  });
  await supabase.from("employee_compensation_history").insert({
    employee_id: created.id,
    effective_from: dateOfHire,
    basic: payload.basic,
    house_allowance: payload.house_allowance,
    transport_allowance: payload.transport_allowance,
    other_allowance: payload.other_allowance,
    reason: "Hired",
  });

  revalidatePath("/dashboard/employees");
  });
}

// Single edit form covering org structure (department, manager, branch) and
// the Section 9/10/42 compliance fields (probation, written contract) that
// are usually settled after the employee record already exists. Every
// changed field is written to employee_audit_log so there's a real history
// behind the Audit Log page, not just the latest snapshot.
export async function updateEmployee(employeeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const decision = await authorize(supabase, {
    resource: "employees",
    action: "edit",
    recordId: employeeId,
  });
  if (!decision.allowed) throw new Error("You do not have permission to edit this employee record.");

  const { data: before } = await supabase
    .from("employees")
    .select(
      "staff_no, department, job_title, employment_type, date_of_hire, reporting_manager_id, branch_id, probation_end_date, contract_issued_on, basic, house_allowance, transport_allowance, other_allowance, kra_pin, nssf_no, shif_no, bank_name, bank_account_no, bank_branch_code, date_of_birth, gender, marital_status, national_id, passport_no, nationality, personal_email, phone_number, physical_address, postal_address"
    )
    .eq("id", employeeId)
    .single();

  const after: Record<string, string | number | null> = {
    staff_no: String(formData.get("staff_no") || ""),
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || ""),
    date_of_hire: String(formData.get("date_of_hire") || "") || null,
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
    branch_id: String(formData.get("branch_id") || "") || null,
    probation_end_date: String(formData.get("probation_end_date") || "") || null,
    contract_issued_on: String(formData.get("contract_issued_on") || "") || null,
    basic: Number(formData.get("basic") || 0),
    house_allowance: Number(formData.get("house_allowance") || 0),
    transport_allowance: Number(formData.get("transport_allowance") || 0),
    other_allowance: Number(formData.get("other_allowance") || 0),
    kra_pin: String(formData.get("kra_pin") || "") || null,
    nssf_no: String(formData.get("nssf_no") || "") || null,
    shif_no: String(formData.get("shif_no") || "") || null,
    bank_name: String(formData.get("bank_name") || "") || null,
    bank_account_no: String(formData.get("bank_account_no") || "") || null,
    bank_branch_code: String(formData.get("bank_branch_code") || "") || null,
    date_of_birth: String(formData.get("date_of_birth") || "") || null,
    gender: String(formData.get("gender") || "") || null,
    marital_status: String(formData.get("marital_status") || "") || null,
    national_id: String(formData.get("national_id") || "") || null,
    passport_no: String(formData.get("passport_no") || "") || null,
    nationality: String(formData.get("nationality") || "") || null,
    personal_email: String(formData.get("personal_email") || "") || null,
    phone_number: String(formData.get("phone_number") || "") || null,
    physical_address: String(formData.get("physical_address") || "") || null,
    postal_address: String(formData.get("postal_address") || "") || null,
  };

  const { error } = await supabase.from("employees").update(after).eq("id", employeeId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("That staff number is already in use by another employee.");
    }
    throw new Error(error.message);
  }

  if (before && user) {
    await logEmployeeChanges(supabase, employeeId, user.id, before as Record<string, unknown>, after);
    await recordJobHistoryChange(supabase, employeeId, before, after as typeof before);
    await recordCompensationHistoryChange(supabase, employeeId, user.id, before, after as typeof before);

    const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
    if (appUser) {
      await recordAuditEvent(supabase, {
        orgId: appUser.org_id,
        actorUserId: user.id,
        action: "employee.updated",
        resourceType: "employee",
        resourceId: employeeId,
        eventCategory: "data",
        before: before as Record<string, unknown>,
        after,
      });
    }
  }

  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/organogram");
  revalidatePath(`/dashboard/employees/${employeeId}`);
  });
}

// Not currently wired to a button anywhere (Settings -> Manage Users is the
// UI for this today, and links an employee the same way). Kept as the
// programmatic entry point for creating a login directly from an employee
// record, now backed by the real Auth Admin call (see
// lib/auth/provision-user.ts) instead of a stub.
export async function inviteToEss(employeeId: string, email: string, password: string, role: AppRole = "employee") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || appUser.role !== "admin") throw new Error("Only an admin can create a login.");

  await createAppUserLogin(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    identifier: email,
    password,
    role,
    employeeId,
  });

  revalidatePath("/dashboard/employees");
  revalidatePath(`/dashboard/employees/${employeeId}`);
  revalidatePath("/dashboard/settings");
}
