"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { publishAndProcessEvent } from "@/lib/workflows/events/publish-and-process";
import { resumeWorkflowFromApproval } from "@/lib/workflows/runtime/resume-from-approval";
import { ALLOWED_FIELDS } from "./profile-change-fields";

export async function submitProfileChangeRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("org_id, employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const field = String(formData.get("field") || "");
  if (!ALLOWED_FIELDS.includes(field as (typeof ALLOWED_FIELDS)[number])) {
    throw new Error("That field can't be changed through a self-service request.");
  }
  const newValue = String(formData.get("new_value") || "").trim();
  if (!newValue) throw new Error("Enter the new value.");
  const reason = String(formData.get("reason") || "") || null;

  const { data: employee } = await supabase
    .from("employees")
    .select("personal_email, phone_number, physical_address, postal_address, marital_status, nationality")
    .eq("id", appUser.employee_id)
    .single();
  const oldValue = employee ? String((employee as Record<string, unknown>)[field] ?? "") : null;

  const { data: changeRequest, error } = await supabase
    .from("profile_change_requests")
    .insert({ employee_id: appUser.employee_id, field, old_value: oldValue, new_value: newValue, reason })
    .select("id, employees(name)")
    .single();
  if (error) throw new Error(error.message);

  // Workflow Automation Engine (Area 03) now owns this end-to-end: the
  // published "Employee Data Change" graph (seeded in migration 0049) does
  // the manager notification, the HR approval (via Area 02's startApproval
  // — same approval_definitions row from migration 0041, just invoked from
  // the engine's approval node instead of directly from here), and — once
  // decided — applying the field change or rejecting it, plus the
  // employee's own decision notification. This action's only job now is to
  // publish the event that kicks that off; everything downstream lives in
  // the workflow graph and the registered actions it calls, not here.
  const empName = (changeRequest.employees as unknown as { name: string } | null)?.name ?? "An employee";
  await publishAndProcessEvent(supabase, {
    orgId: appUser.org_id,
    eventName: "employee_data_change.requested",
    entityType: "profile_change_request",
    entityId: changeRequest.id,
    createdBy: user.id,
    payload: {
      employeeId: appUser.employee_id,
      subjectEmployeeId: appUser.employee_id,
      requestedBy: user.id,
      changeRequestId: changeRequest.id,
      field,
      fieldLabel: field.replace(/_/g, " "),
      oldValue,
      oldValueDisplay: oldValue ?? "—",
      newValue,
      employeeName: empName,
      entityType: "profile_change_request",
      entityId: changeRequest.id,
    },
  });

  revalidatePath("/dashboard/employees/me");
  revalidatePath("/dashboard/approvals");
}

// Shared by the Approvals inbox for this specific request type: on
// approval, actually writes the field to the employees row (the approval
// engine itself is generic and doesn't know how to apply any particular
// change — that's left to the module that created the request).
export async function decideProfileChangeApproval(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can decide this.");

  // The subject employee's id for the RBAC record-level check — a profile
  // change request names one specific employee whose record would be
  // edited on approval, so this is an edit-on-employees decision, not a
  // coarse one.
  const { data: changeRequestForRbac } = await supabase
    .from("approval_steps")
    .select("approval_requests(subject_employee_id)")
    .eq("id", stepId)
    .maybeSingle();
  const subjectEmployeeId =
    (changeRequestForRbac?.approval_requests as unknown as { subject_employee_id: string | null } | null)
      ?.subject_employee_id ?? null;

  const { requestId } = await decideApprovalStep(supabase, {
    stepId,
    orgId: appUser.org_id,
    decision,
    rbac: subjectEmployeeId
      ? { resource: "employees", action: "edit", sensitivity: "normal", recordId: subjectEmployeeId }
      : undefined,
  });

  // Hands off to the Workflow Automation Engine (Area 03): decideApprovalStep
  // itself stays completely unaware that a workflow exists (Area 02
  // constraint). This looks for the workflow_run_nodes row still 'waiting'
  // on this approval request — there is one here, since submitting a
  // profile change request now always starts the Employee Data Change
  // run — and resumes it, which applies the field change or rejects it
  // (via the registered actions) and notifies the employee, all from the
  // seeded graph rather than inline code here.
  await resumeWorkflowFromApproval(supabase, requestId, decision);

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/employees");
}
