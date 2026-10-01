"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { startApproval } from "@/lib/approvals/start-approval";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { startWorkflowRun, completeWorkflowRun, PRIORITY_WORKFLOW_KEYS } from "@/lib/workflows/start-workflow-run";
import { createNotificationForMany, createNotification } from "@/lib/notifications/create-notification";
import { getManagerRecipient, getEmployeeUserId } from "@/lib/notifications/recipients";
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

  // Definition-driven now (Universal Approval Engine, Area 02) — the
  // approval_definitions row seeded in migration 0041 resolves to the same
  // single HR step this used to hard-code, just through resolveApprover()
  // instead of a literal { approverRole: "hr" } array.
  const { requestId: approvalRequestId } = await startApproval(supabase, {
    orgId: appUser.org_id,
    resource: "employee_data_change",
    entityType: "profile_change_request",
    entityId: changeRequest.id,
    requesterId: user.id,
    subjectEmployeeId: appUser.employee_id,
    summary: `Change ${field.replace(/_/g, " ")} from "${oldValue ?? "—"}" to "${newValue}"`,
    metadata: { field, old_value: oldValue, new_value: newValue },
  });

  await supabase.from("profile_change_requests").update({ approval_request_id: approvalRequestId }).eq("id", changeRequest.id);

  await startWorkflowRun(supabase, {
    orgId: appUser.org_id,
    key: PRIORITY_WORKFLOW_KEYS.EMPLOYEE_DATA_CHANGE,
    entityType: "profile_change_request",
    entityId: changeRequest.id,
  });

  // HR already gets a notification for this via startApproval's own
  // approval.step_assigned (category "approval") — only the employee's
  // manager still needs one here, since they aren't part of the HR-only
  // approval chain but should still know a change is pending.
  const empName = (changeRequest.employees as unknown as { name: string } | null)?.name ?? "An employee";
  const managerRecipients = await getManagerRecipient(supabase, appUser.employee_id);
  if (managerRecipients.length > 0) {
    await createNotificationForMany(supabase, managerRecipients, {
      orgId: appUser.org_id,
      type: "PROFILE_CHANGE_REQUESTED",
      category: "self_service",
      priority: "information",
      title: "Profile change request submitted",
      message: `${empName} requested to change ${field.replace(/_/g, " ")}.`,
      entityType: "profile_change_request",
      entityId: changeRequest.id,
      actionUrl: "/dashboard/approvals",
    });
  }

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

  const { data: changeRequest } = await supabase
    .from("profile_change_requests")
    .select("id, employee_id, field, new_value")
    .eq("approval_request_id", requestId)
    .maybeSingle();

  if (changeRequest) {
    if (decision === "approved") {
      await supabase
        .from("employees")
        .update({ [changeRequest.field]: changeRequest.new_value })
        .eq("id", changeRequest.employee_id);
    }
    await supabase
      .from("profile_change_requests")
      .update({ status: decision === "approved" ? "Approved" : "Rejected", decided_at: new Date().toISOString() })
      .eq("id", changeRequest.id);

    const { data: run } = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("entity_type", "profile_change_request")
      .eq("entity_id", changeRequest.id)
      .eq("status", "running")
      .maybeSingle();
    if (run) await completeWorkflowRun(supabase, run.id, decision === "approved" ? "completed" : "failed");

    const employeeUserId = await getEmployeeUserId(supabase, changeRequest.employee_id);
    if (employeeUserId) {
      await createNotification(supabase, {
        orgId: appUser.org_id,
        recipientUserId: employeeUserId,
        type: `PROFILE_CHANGE_${decision.toUpperCase()}`,
        category: "self_service",
        priority: "information",
        title: `Profile change ${decision}`,
        message: `Your request to change ${changeRequest.field.replace(/_/g, " ")} was ${decision}.`,
        entityType: "profile_change_request",
        entityId: changeRequest.id,
        actionUrl: "/dashboard/employees/me",
      });
    }
  }

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/employees");
}
