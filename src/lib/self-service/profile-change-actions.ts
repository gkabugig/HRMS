"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { publishAndProcessEvent } from "@/lib/workflows/events/publish-and-process";
import { resumeWorkflowFromApproval } from "@/lib/workflows/runtime/resume-from-approval";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { ALLOWED_FIELDS, FIELD_LABELS, isHighSensitivityField, type AllowedField } from "./profile-change-fields";

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
  if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
    throw new Error("That field can't be changed through a self-service request.");
  }
  const newValue = String(formData.get("new_value") || "").trim();
  if (!newValue) throw new Error("Enter the new value.");
  const reason = String(formData.get("reason") || "") || null;

  // High-sensitivity fields (bank/national/statutory IDs) require evidence —
  // spec §5 "Restricted request + evidence + HR approval" — the evidence
  // must be a document the employee already owns (self_read RLS on
  // employee_documents enforces that at the select below, independent of
  // this app-layer check). Tier is 'highly_restricted', not 'confidential'
  // — see profile-change-fields.ts and migration 0068 for why.
  const sensitivity = isHighSensitivityField(field) ? "highly_restricted" : "normal";
  const evidenceDocumentId = String(formData.get("evidence_document_id") || "") || null;
  if (sensitivity === "highly_restricted") {
    if (!evidenceDocumentId) {
      throw new Error("This field requires supporting evidence (e.g. a bank letter or ID copy) before it can be submitted.");
    }
    const { data: evidenceDoc } = await supabase
      .from("employee_documents")
      .select("id")
      .eq("id", evidenceDocumentId)
      .eq("employee_id", appUser.employee_id)
      .maybeSingle();
    if (!evidenceDoc) throw new Error("Evidence document not found, or doesn't belong to you.");
  }

  const { data: employee } = await supabase
    .from("employees")
    .select(
      "personal_email, phone_number, physical_address, postal_address, marital_status, nationality, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, bank_name, bank_account_no, bank_branch_code, national_id, passport_no, kra_pin, nssf_no, shif_no"
    )
    .eq("id", appUser.employee_id)
    .single();
  const oldValue = employee ? String((employee as Record<string, unknown>)[field] ?? "") : null;

  const { data: changeRequest, error } = await supabase
    .from("profile_change_requests")
    .insert({
      employee_id: appUser.employee_id,
      field,
      old_value: oldValue,
      new_value: newValue,
      reason,
      sensitivity,
      evidence_document_id: evidenceDocumentId,
    })
    .select("id, employees(name)")
    .single();
  if (error) throw new Error(error.message);

  if (sensitivity === "highly_restricted") {
    await recordAuditEvent(supabase, {
      orgId: appUser.org_id,
      actorUserId: user.id,
      action: "profile_change.high_sensitivity_requested",
      resourceType: "profile_change_request",
      resourceId: changeRequest.id,
      eventCategory: "data",
      riskLevel: "elevated",
      after: { field, employeeId: appUser.employee_id },
    });
  }

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
      fieldLabel: FIELD_LABELS[field as AllowedField] ?? field.replace(/_/g, " "),
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
    .select("approval_requests(subject_employee_id, entity_id)")
    .eq("id", stepId)
    .maybeSingle();
  const approvalRequestRow = changeRequestForRbac?.approval_requests as unknown as {
    subject_employee_id: string | null;
    entity_id: string | null;
  } | null;
  const subjectEmployeeId = approvalRequestRow?.subject_employee_id ?? null;

  // Bank/national/statutory-ID changes (migration 0064) were flagged
  // sensitivity='highly_restricted' at submission (migration 0068 — see
  // profile-change-fields.ts for why it's not 'confidential') — the
  // decision check below requires whatever RBAC tier that is, so an HR
  // role only granted 'normal'-sensitivity approval on employees can't
  // wave through a high-sensitivity change that a seeded permission grant
  // deliberately reserves for a higher tier.
  let sensitivity: "normal" | "highly_restricted" = "normal";
  if (approvalRequestRow?.entity_id) {
    const { data: changeRequest } = await supabase
      .from("profile_change_requests")
      .select("sensitivity")
      .eq("id", approvalRequestRow.entity_id)
      .maybeSingle();
    if (changeRequest?.sensitivity === "highly_restricted") sensitivity = "highly_restricted";
  }

  const { requestId } = await decideApprovalStep(supabase, {
    stepId,
    orgId: appUser.org_id,
    decision,
    rbac: subjectEmployeeId
      ? { resource: "employees", action: "edit", sensitivity, recordId: subjectEmployeeId }
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
