"use server";

// Area 16 §7.5/§7.7: a workforce plan (header + per-unit/type lines) is
// drafted, then submitted for a single HR/admin approval step before it can
// be marked "active" — again reusing Area 02's generic engine rather than a
// bespoke plan-approval flow.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage workforce plans.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function createWorkforcePlan(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const name = String(formData.get("name") || "").trim();
  const start = String(formData.get("planning_period_start") || "");
  const end = String(formData.get("planning_period_end") || "");
  if (!name) throw new Error("Plan name is required.");
  if (!start || !end) throw new Error("Planning period start and end are required.");

  const { error } = await supabase
    .from("workforce_plans")
    .insert({ org_id: orgId, name, planning_period_start: start, planning_period_end: end, status: "draft", owner_user_id: userId });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/positions/plans");
}

export async function addWorkforcePlanLine(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);

  const planId = String(formData.get("plan_id") || "");
  const { data: plan } = await supabase.from("workforce_plans").select("id, status").eq("id", planId).eq("org_id", orgId).maybeSingle();
  if (!plan) throw new Error("Plan not found.");
  if (plan.status !== "draft") throw new Error("Only a draft plan can be edited.");

  const { error } = await supabase.from("workforce_plan_lines").insert({
    plan_id: planId,
    org_id: orgId,
    organisation_unit_id: String(formData.get("organisation_unit_id") || "") || null,
    position_type_id: String(formData.get("position_type_id") || "") || null,
    grade: String(formData.get("grade") || "") || null,
    planned_headcount: Number(formData.get("planned_headcount") || 0),
    planned_cost: formData.get("planned_cost") ? Number(formData.get("planned_cost")) : null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/positions/plans/${planId}`);
}

export async function submitWorkforcePlan(planId: string) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const { data: plan } = await supabase.from("workforce_plans").select("id, name, status").eq("id", planId).eq("org_id", orgId).maybeSingle();
  if (!plan) throw new Error("Plan not found.");
  if (plan.status !== "draft") throw new Error("Only a draft plan can be submitted.");

  const { data: lines } = await supabase.from("workforce_plan_lines").select("id").eq("plan_id", planId);
  if (!lines || lines.length === 0) throw new Error("Add at least one plan line before submitting.");

  const approvalRequestId = await createApprovalRequest(supabase, {
    orgId,
    requestType: "workforce_plan_approval",
    entityType: "workforce_plan",
    entityId: planId,
    requestedBy: userId,
    summary: `Workforce plan for approval: ${plan.name}`,
    steps: [{ approverRole: "admin" }],
  });

  await supabase.from("workforce_plans").update({ status: "submitted", approval_request_id: approvalRequestId }).eq("id", planId);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "workforce_plan.submitted",
    resourceType: "workforce_plan",
    resourceId: planId,
    eventCategory: "workflow",
  });

  revalidatePath(`/dashboard/positions/plans/${planId}`);
  revalidatePath("/dashboard/approvals");
}

// Dispatched from the universal approvals inbox for request_type ===
// 'workforce_plan_approval'.
export async function decideWorkforcePlanApproval(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase
    .from("approval_steps")
    .select("approval_requests(entity_id)")
    .eq("id", stepId)
    .maybeSingle();
  const planId = (stepRow?.approval_requests as unknown as { entity_id: string | null } | null)?.entity_id ?? null;
  if (!planId) throw new Error("Workforce plan not found.");

  const { requestId } = await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });

  await supabase
    .from("workforce_plans")
    .update({
      status: decision === "approved" ? "approved" : "draft",
      approved_at: decision === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", planId);

  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    actorRole: appUser.role,
    action: `workforce_plan.${decision}`,
    resourceType: "workforce_plan",
    resourceId: planId,
    eventCategory: "approval",
    after: { decision },
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath(`/dashboard/positions/plans/${planId}`);

  return { requestId };
}

// Admin/HR flips an approved plan to "active" once it's ready to be acted
// on (no further approval — the budget decision already happened).
export async function activateWorkforcePlan(planId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("workforce_plans").update({ status: "active" }).eq("id", planId).eq("org_id", orgId).eq("status", "approved");
  revalidatePath(`/dashboard/positions/plans/${planId}`);
}

export async function closeWorkforcePlan(planId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("workforce_plans").update({ status: "closed" }).eq("id", planId).eq("org_id", orgId);
  revalidatePath(`/dashboard/positions/plans/${planId}`);
}
