"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { escalateStep } from "@/lib/approvals/escalate-step";
import { decideProfileChangeApproval } from "@/lib/self-service/profile-change-actions";
import { decideAttendanceCorrectionRequest } from "@/lib/attendance/request-correction-actions";
import { decideDocumentApproval } from "@/lib/documents/lifecycle";
import { decidePositionRequest } from "@/lib/positions/position-request-actions";
import { decideWorkforcePlanApproval } from "@/lib/positions/workforce-plan-actions";
import { decidePromotionCase } from "@/lib/rewards/promotion-actions";
import { decideRewardRecommendation } from "@/lib/rewards/review-actions";
import { decideCompensationChangeRequest } from "@/lib/compensation/change-request-actions";

// Single entry point the inbox calls, regardless of which module opened
// the request. Most request types only need the generic engine (record the
// decision, advance/close the request) — but a few need a follow-up effect
// applied only once the request is actually approved (e.g. writing the new
// field value), so those get dispatched to their own module-specific
// handler instead, which itself calls decideApprovalStep internally.
export async function decideApproval(stepId: string, decision: "approved" | "rejected" | "returned") {
  const supabase = await createClient();
  const { data: step } = await supabase
    .from("approval_steps")
    .select("approval_requests(request_type)")
    .eq("id", stepId)
    .maybeSingle();
  const requestType = (step?.approval_requests as unknown as { request_type: string } | null)?.request_type;

  if (requestType === "employee_data_change" && (decision === "approved" || decision === "rejected")) {
    await decideProfileChangeApproval(stepId, decision);
    return;
  }

  if (requestType === "attendance_correction" && (decision === "approved" || decision === "rejected")) {
    await decideAttendanceCorrectionRequest(stepId, decision);
    return;
  }

  if (requestType === "document_issue") {
    await decideDocumentApproval(stepId, decision);
    return;
  }

  if (
    requestType &&
    ["position_create", "position_change", "position_freeze", "position_unfreeze", "position_close"].includes(requestType) &&
    (decision === "approved" || decision === "rejected")
  ) {
    await decidePositionRequest(stepId, decision);
    return;
  }

  if (requestType === "workforce_plan_approval" && (decision === "approved" || decision === "rejected")) {
    await decideWorkforcePlanApproval(stepId, decision);
    return;
  }

  if (requestType === "promotion_case" && (decision === "approved" || decision === "rejected")) {
    await decidePromotionCase(stepId, decision);
    return;
  }

  if (requestType === "reward_recommendation" && (decision === "approved" || decision === "rejected")) {
    await decideRewardRecommendation(stepId, decision);
    return;
  }

  if (requestType === "compensation_change" && (decision === "approved" || decision === "rejected")) {
    await decideCompensationChangeRequest(stepId, decision);
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });
  revalidatePath("/dashboard/approvals");
}

// Manual escalation (the button on an overdue row) — only admin/hr can pull
// this lever; it reassigns the step and logs approval_escalations the same
// way the scheduled job does (escalateStep itself knows nothing about who's
// calling it).
export async function escalateApprovalStep(stepId: string, reason?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can escalate an approval.");

  await escalateStep(supabase, { stepId, orgId: appUser.org_id, reason: reason ?? null, actorUserId: user.id });
  revalidatePath("/dashboard/approvals");
}
