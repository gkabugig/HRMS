"use server";

// Area 17 §8.3/§8.8 — compensation change requests. Submitted by a manager
// (for their own reports) or HR/admin, routed through Area 02's generic
// approval engine (same hand-built-steps pattern as Area 16's
// position-request-actions.ts), and applied via apply-change.ts once
// approved — immediately if effective_from is today/past, otherwise left
// "scheduled" for the daily cron to apply when the date arrives.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { applyCompensationChange } from "./apply-change";
import { checkCompensationBudget } from "./budget-check";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireManagerOrHr(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");
  if (!["admin", "hr"].includes(appUser.role)) {
    const { data: isManager } = await supabase.rpc("is_manager_of", { target_employee_id: employeeId });
    if (!isManager) throw new Error("Only the employee's manager or HR/admin can propose a compensation change.");
  }
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function submitCompensationChangeRequest(formData: FormData) {
  const supabase = await createClient();
  const employeeId = String(formData.get("employee_id") || "");
  if (!employeeId) throw new Error("Select an employee.");
  const { userId, orgId } = await requireManagerOrHr(supabase, employeeId);

  const effectiveFrom = String(formData.get("effective_from") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!effectiveFrom) throw new Error("Effective date is required.");
  if (!reason) throw new Error("A reason is required.");

  const proposedGradeId = String(formData.get("proposed_grade_id") || "") || null;
  const proposedBasic = formData.get("proposed_basic") ? Number(formData.get("proposed_basic")) : null;
  const proposedHouse = formData.get("proposed_house_allowance") ? Number(formData.get("proposed_house_allowance")) : null;
  const proposedTransport = formData.get("proposed_transport_allowance") ? Number(formData.get("proposed_transport_allowance")) : null;
  const proposedOther = formData.get("proposed_other_allowance") ? Number(formData.get("proposed_other_allowance")) : null;

  // Band validation: if a grade is proposed and a current band exists for
  // it, flag whether the proposed basic falls outside the band.
  let isOutsideBand = false;
  if (proposedGradeId && proposedBasic !== null) {
    const { data: band } = await supabase
      .from("compensation_bands")
      .select("min_amount, max_amount")
      .eq("grade_id", proposedGradeId)
      .lte("effective_from", effectiveFrom)
      .or(`effective_to.is.null,effective_to.gte.${effectiveFrom}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (band) isOutsideBand = proposedBasic < Number(band.min_amount) || proposedBasic > Number(band.max_amount);
  }
  const justifiesException = String(formData.get("exception_reason") || "").trim();
  if (isOutsideBand && !justifiesException) {
    throw new Error("This proposed basic falls outside the grade's band — provide an exception justification.");
  }

  const { data: employee } = await supabase.from("employees").select("name").eq("id", employeeId).maybeSingle();

  const { data: requestRow, error } = await supabase
    .from("compensation_change_requests")
    .insert({
      org_id: orgId,
      employee_id: employeeId,
      requested_by: userId,
      status: "submitted",
      proposed_grade_id: proposedGradeId,
      proposed_basic: proposedBasic,
      proposed_house_allowance: proposedHouse,
      proposed_transport_allowance: proposedTransport,
      proposed_other_allowance: proposedOther,
      effective_from: effectiveFrom,
      reason,
      is_outside_band: isOutsideBand,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (isOutsideBand) {
    await supabase.from("compensation_exceptions").insert({
      org_id: orgId,
      change_request_id: requestRow.id,
      reason: justifiesException,
      authorised_by: userId,
    });
  }

  const budgetStatus = await checkCompensationBudget(supabase, orgId, null, effectiveFrom, (proposedBasic ?? 0) * 12);

  const approvalRequestId = await createApprovalRequest(supabase, {
    orgId,
    requestType: "compensation_change",
    entityType: "compensation_change_request",
    entityId: requestRow.id,
    requestedBy: userId,
    subjectEmployeeId: employeeId,
    summary: `Compensation change for ${employee?.name ?? "employee"}, effective ${effectiveFrom}`,
    impact: { proposedBasic, isOutsideBand, budgetStatus },
    steps: [{ approverRole: "hr" }],
  });

  await supabase.from("compensation_change_requests").update({ approval_request_id: approvalRequestId }).eq("id", requestRow.id);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "compensation_change_request.submitted",
    resourceType: "compensation_change_request",
    resourceId: requestRow.id,
    eventCategory: "workflow",
    riskLevel: "elevated",
  });

  revalidatePath("/dashboard/compensation/change-requests");
  revalidatePath("/dashboard/approvals");
}

// Dispatched from the universal approvals inbox for request_type ===
// 'compensation_change'.
export async function decideCompensationChangeRequest(stepId: string, decision: "approved" | "rejected") {
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
  const approvalRequestRow = stepRow?.approval_requests as unknown as { entity_id: string | null; subject_employee_id: string | null } | null;
  const changeRequestId = approvalRequestRow?.entity_id ?? null;
  if (!changeRequestId) throw new Error("Compensation change request not found.");

  const { requestId } = await decideApprovalStep(supabase, {
    stepId,
    orgId: appUser.org_id,
    decision,
    // No dedicated "compensation" RBAC resource exists yet (types.ts lists
    // employees/payroll/leave/...); "payroll" at highly_restricted
    // sensitivity is the closest existing fit for a pay-amount decision.
    rbac: approvalRequestRow?.subject_employee_id
      ? { resource: "payroll", action: "edit", sensitivity: "highly_restricted", recordId: approvalRequestRow.subject_employee_id }
      : undefined,
  });

  const { data: changeRequest } = await supabase.from("compensation_change_requests").select("id, org_id, effective_from").eq("id", changeRequestId).single();
  if (!changeRequest) throw new Error("Compensation change request not found.");

  if (decision === "approved") {
    if (changeRequest.effective_from <= today()) {
      await applyCompensationChange(supabase, changeRequestId, user.id);
    } else {
      await supabase.from("compensation_change_requests").update({ status: "scheduled", decided_at: new Date().toISOString() }).eq("id", changeRequestId);
      await supabase.from("compensation_events").insert({
        org_id: changeRequest.org_id,
        entity_type: "compensation_change_request",
        entity_id: changeRequestId,
        event_type: "scheduled",
        actor_user_id: user.id,
        details: { effectiveFrom: changeRequest.effective_from },
      });
    }
  } else {
    await supabase.from("compensation_change_requests").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", changeRequestId);
  }

  await recordAuditEvent(supabase, {
    orgId: changeRequest.org_id,
    actorUserId: user.id,
    actorRole: appUser.role,
    action: `compensation_change_request.${decision}`,
    resourceType: "compensation_change_request",
    resourceId: changeRequestId,
    eventCategory: "approval",
    riskLevel: "elevated",
    after: { decision },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/compensation/change-requests");

  return { requestId };
}

// HR/admin direct approve/reject, bypassing the approvals-inbox stepId flow
// — used by the REST API (POST .../approve) and any future API-driven
// caller (e.g. an Area 12 AI action tool) that doesn't have an
// approval_steps row to decide against. Still requires HR/admin and still
// records the same audit trail; the generic approval_requests row (if one
// exists) is marked decided to keep it consistent with this outcome.
export async function directlyDecideCompensationChangeRequest(changeRequestId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can decide a compensation change request.");

  const { data: changeRequest } = await supabase
    .from("compensation_change_requests")
    .select("id, org_id, effective_from, approval_request_id, status")
    .eq("id", changeRequestId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();
  if (!changeRequest) throw new Error("Compensation change request not found.");
  if (!["submitted"].includes(changeRequest.status)) throw new Error("Only a submitted request can be decided this way.");

  if (changeRequest.approval_request_id) {
    await supabase
      .from("approval_requests")
      .update({ status: decision === "approved" ? "approved" : "rejected", decided_at: new Date().toISOString() })
      .eq("id", changeRequest.approval_request_id);
    await supabase
      .from("approval_steps")
      .update({ status: decision, decided_at: new Date().toISOString(), comment: "Decided directly via compensation API" })
      .eq("approval_request_id", changeRequest.approval_request_id)
      .eq("status", "pending");
  }

  if (decision === "approved") {
    if (changeRequest.effective_from <= today()) {
      await applyCompensationChange(supabase, changeRequestId, user.id);
    } else {
      await supabase.from("compensation_change_requests").update({ status: "scheduled", decided_at: new Date().toISOString() }).eq("id", changeRequestId);
    }
  } else {
    await supabase.from("compensation_change_requests").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", changeRequestId);
  }

  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    actorRole: appUser.role,
    action: `compensation_change_request.${decision}`,
    resourceType: "compensation_change_request",
    resourceId: changeRequestId,
    eventCategory: "approval",
    riskLevel: "elevated",
    after: { decision },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/compensation/change-requests");
}

export async function cancelCompensationChangeRequest(changeRequestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can cancel a compensation change request.");

  await supabase
    .from("compensation_change_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", changeRequestId)
    .eq("org_id", appUser.org_id)
    .in("status", ["draft", "submitted", "approved", "scheduled"]);

  revalidatePath("/dashboard/compensation/change-requests");
}
