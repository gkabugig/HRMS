"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { startWorkflowRun, completeWorkflowRun, PRIORITY_WORKFLOW_KEYS } from "@/lib/workflows/start-workflow-run";
import { createNotificationForMany, createNotification } from "@/lib/notifications/create-notification";
import { getHrAndManagerRecipients, getEmployeeUserId } from "@/lib/notifications/recipients";
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

  const approvalRequestId = await createApprovalRequest(supabase, {
    orgId: appUser.org_id,
    requestType: "employee_data_change",
    entityType: "profile_change_request",
    entityId: changeRequest.id,
    requestedBy: user.id,
    subjectEmployeeId: appUser.employee_id,
    summary: `Change ${field.replace(/_/g, " ")} from "${oldValue ?? "—"}" to "${newValue}"`,
    steps: [{ approverRole: "hr" }],
  });

  await supabase.from("profile_change_requests").update({ approval_request_id: approvalRequestId }).eq("id", changeRequest.id);

  await startWorkflowRun(supabase, {
    orgId: appUser.org_id,
    key: PRIORITY_WORKFLOW_KEYS.EMPLOYEE_DATA_CHANGE,
    entityType: "profile_change_request",
    entityId: changeRequest.id,
  });

  const empName = (changeRequest.employees as unknown as { name: string } | null)?.name ?? "An employee";
  const recipients = await getHrAndManagerRecipients(supabase, appUser.org_id, appUser.employee_id);
  await createNotificationForMany(supabase, recipients, {
    orgId: appUser.org_id,
    type: "PROFILE_CHANGE_REQUESTED",
    category: "self_service",
    priority: "action_required",
    title: "Profile change request awaiting approval",
    message: `${empName} requested to change ${field.replace(/_/g, " ")}.`,
    entityType: "profile_change_request",
    entityId: changeRequest.id,
    actionUrl: "/dashboard/approvals",
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

  const { requestId } = await decideApprovalStep(supabase, {
    stepId,
    actorUserId: user.id,
    orgId: appUser.org_id,
    decision,
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
