"use server";

// Area 05 §6/§21 — the employee-submitted attendance correction REQUEST,
// distinct from correctAttendance() (src/lib/attendance/correct-attendance.ts)
// which remains the direct, manager/HR/admin-only correction tool
// (canCorrectAttendance(role)). This never writes to `attendance` directly:
// it opens an attendance_correction_requests row (migration 0064), routes it
// through the generic Area 02 approval engine (one step: the employee's
// current line manager if the authoritative org model resolves one,
// otherwise HR — Area 04 integration per spec §22), and only calls
// correctAttendance() once that step is approved — "Approved correction is
// applied through attendance domain service" (spec §21 item 15), never
// bypassed.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { correctAttendance } from "./correct-attendance";
import { getCurrentManager } from "@/lib/organisation/get-current-manager";
import { getEmployeeUserId } from "@/lib/notifications/recipients";
import { createNotification } from "@/lib/notifications/create-notification";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

export async function submitAttendanceCorrectionRequest(formData: FormData) {
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

  const workDate = String(formData.get("work_date") || "");
  const field = String(formData.get("field") || "");
  const requestedValue = String(formData.get("requested_value") || "").trim();
  const reason = String(formData.get("reason") || "").trim();
  const evidenceDocumentId = String(formData.get("evidence_document_id") || "") || null;

  if (!workDate) throw new Error("Select the date to correct.");
  if (field !== "clock_in" && field !== "clock_out") throw new Error("Select which time to correct.");
  if (!requestedValue) throw new Error("Enter the corrected time.");
  if (!reason) throw new Error("Explain why this correction is needed.");

  if (evidenceDocumentId) {
    const { data: evidenceDoc } = await supabase
      .from("employee_documents")
      .select("id")
      .eq("id", evidenceDocumentId)
      .eq("employee_id", appUser.employee_id)
      .maybeSingle();
    if (!evidenceDoc) throw new Error("Evidence document not found, or doesn't belong to you.");
  }

  const { data: requestRow, error } = await supabase
    .from("attendance_correction_requests")
    .insert({
      org_id: appUser.org_id,
      employee_id: appUser.employee_id,
      work_date: workDate,
      field,
      requested_value: requestedValue,
      reason,
      evidence_document_id: evidenceDocumentId,
      status: "Under Review",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Area 04: resolve the employee's current line manager from the
  // authoritative org model, not employees.reporting_manager_id — falls
  // back to an HR-role step if none is resolved (new hire, vacant chain).
  const managerEmployeeId = await getCurrentManager(supabase, appUser.employee_id);
  const managerUserId = managerEmployeeId ? await getEmployeeUserId(supabase, managerEmployeeId) : null;

  const { data: employee } = await supabase.from("employees").select("name").eq("id", appUser.employee_id).maybeSingle();

  const approvalRequestId = await createApprovalRequest(supabase, {
    orgId: appUser.org_id,
    requestType: "attendance_correction",
    entityType: "attendance_correction_request",
    entityId: requestRow.id,
    requestedBy: user.id,
    subjectEmployeeId: appUser.employee_id,
    summary: `Correct ${field.replace("_", " ")} on ${workDate} to ${requestedValue} — ${employee?.name ?? "employee"}`,
    impact: { workDate, field, requestedValue },
    steps: managerUserId ? [{ approverUserId: managerUserId }] : [{ approverRole: "hr" }],
  });

  await supabase
    .from("attendance_correction_requests")
    .update({ approval_request_id: approvalRequestId })
    .eq("id", requestRow.id);

  if (managerUserId) {
    await createNotification(supabase, {
      orgId: appUser.org_id,
      recipientUserId: managerUserId,
      type: "ATTENDANCE_CORRECTION_REQUESTED",
      category: "attendance",
      priority: "action_required",
      title: "Attendance correction request",
      message: `${employee?.name ?? "An employee"} requested a correction to ${field.replace("_", " ")} on ${workDate}.`,
      entityType: "attendance_correction_request",
      entityId: requestRow.id,
      actionUrl: "/dashboard/approvals",
    });
  }

  revalidatePath("/dashboard/me/attendance");
  revalidatePath("/dashboard/approvals");
}

// Dispatched from the universal approvals inbox (src/app/dashboard/
// approvals/actions.ts) for request_type === 'attendance_correction',
// exactly the way decideProfileChangeApproval is dispatched for
// 'employee_data_change' — the generic engine records the decision, this
// applies the module-specific effect once approved.
export async function decideAttendanceCorrectionRequest(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase
    .from("approval_steps")
    .select("approval_requests(entity_id, subject_employee_id)")
    .eq("id", stepId)
    .maybeSingle();
  const approvalRequestRow = stepRow?.approval_requests as unknown as {
    entity_id: string | null;
    subject_employee_id: string | null;
  } | null;
  const correctionRequestId = approvalRequestRow?.entity_id ?? null;
  if (!correctionRequestId) throw new Error("Correction request not found.");

  const { requestId, requestStatus } = await decideApprovalStep(supabase, {
    stepId,
    orgId: appUser.org_id,
    decision,
    rbac: approvalRequestRow?.subject_employee_id
      ? { resource: "attendance", action: "edit", sensitivity: "normal", recordId: approvalRequestRow.subject_employee_id }
      : undefined,
  });

  // Multi-step requests (e.g. an administrator's, approved by HR then the CEO):
  // the change only takes effect once the FINAL step is approved.
  if (decision === "approved" && requestStatus !== "approved") {
    revalidatePath("/dashboard/approvals");
    return { requestId };
  }

  const { data: correctionRequest } = await supabase
    .from("attendance_correction_requests")
    .select("id, org_id, employee_id, work_date, field, requested_value, reason")
    .eq("id", correctionRequestId)
    .single();
  if (!correctionRequest) throw new Error("Correction request not found.");

  if (decision === "approved") {
    await correctAttendance(supabase, {
      orgId: correctionRequest.org_id,
      employeeId: correctionRequest.employee_id,
      workDate: correctionRequest.work_date,
      field: correctionRequest.field as "clock_in" | "clock_out",
      correctedValue: correctionRequest.requested_value,
      reason: `Employee-requested correction (approved): ${correctionRequest.reason}`,
      actorId: user.id,
    });
  }

  await supabase
    .from("attendance_correction_requests")
    .update({ status: decision === "approved" ? "Approved" : "Rejected", decided_at: new Date().toISOString() })
    .eq("id", correctionRequestId);

  const employeeUserId = await getEmployeeUserId(supabase, correctionRequest.employee_id);
  if (employeeUserId) {
    await createNotification(supabase, {
      orgId: correctionRequest.org_id,
      recipientUserId: employeeUserId,
      type: "ATTENDANCE_CORRECTION_DECIDED",
      category: "attendance",
      priority: "information",
      title: `Attendance correction ${decision}`,
      message: `Your correction request for ${correctionRequest.work_date} was ${decision}.`,
      entityType: "attendance_correction_request",
      entityId: correctionRequest.id,
      actionUrl: "/dashboard/me/attendance",
    });
  }

  await recordAuditEvent(supabase, {
    orgId: correctionRequest.org_id,
    actorUserId: user.id,
    actorRole: appUser.role,
    action: `attendance_correction.${decision}`,
    resourceType: "attendance_correction_request",
    resourceId: correctionRequest.id,
    eventCategory: "approval",
    after: { decision },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/me/attendance");

  return { requestId };
}

// Employee withdraws their own request while it's still Submitted/Under
// Review and no decision has been made yet. Rejects the still-pending
// approval request too (rather than leaving an orphaned pending step) by
// reusing decideApprovalStep with a 'rejected' decision recorded as a
// system/self action — simplest correct way to close it without a bespoke
// "withdraw" verb in the approval engine itself.
export async function cancelAttendanceCorrectionRequest(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const { data: correctionRequest } = await supabase
    .from("attendance_correction_requests")
    .select("id, employee_id, status, approval_request_id")
    .eq("id", requestId)
    .single();
  if (!correctionRequest || correctionRequest.employee_id !== appUser.employee_id) {
    throw new Error("Correction request not found.");
  }
  if (!["Submitted", "Under Review"].includes(correctionRequest.status)) {
    throw new Error("Only a pending request can be withdrawn.");
  }

  if (correctionRequest.approval_request_id) {
    await supabase
      .from("approval_requests")
      .update({ status: "returned", decided_at: new Date().toISOString() })
      .eq("id", correctionRequest.approval_request_id)
      .eq("status", "pending_approval");
    await supabase
      .from("approval_steps")
      .update({ status: "returned", decided_at: new Date().toISOString(), comment: "Withdrawn by employee" })
      .eq("approval_request_id", correctionRequest.approval_request_id)
      .eq("status", "pending");
  }

  const { error } = await supabase
    .from("attendance_correction_requests")
    .update({ status: "Cancelled", decided_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/me/attendance");
}
