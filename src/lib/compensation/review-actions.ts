"use server";

// Area 17 §8.6 Annual review flow: cycle -> eligible employees -> manager
// recommendations -> budget validation -> HR calibration -> approval ->
// effective-dated records -> payroll export. HR calibration + approval of a
// review item IS the governance step for that item (the cycle itself is
// HR/admin-owned end to end), so approving an item here creates and
// immediately applies/schedules its compensation_change_request directly —
// it deliberately does not spin up a second, per-employee approval_requests
// row through the generic engine on top of the review cycle's own approval.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { applyCompensationChange } from "./apply-change";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage compensation review cycles.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function createReviewCycle(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  const name = String(formData.get("name") || "").trim();
  const periodStart = String(formData.get("period_start") || "");
  const periodEnd = String(formData.get("period_end") || "");
  if (!name || !periodStart || !periodEnd) throw new Error("Name and period are required.");

  const { error } = await supabase.from("compensation_review_cycles").insert({ org_id: orgId, name, period_start: periodStart, period_end: periodEnd, status: "draft", created_by: userId });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/compensation/reviews");
}

// Populates review items for every active employee in the org (the
// "eligible employees" step) — a simple org-wide eligibility rule; a
// configurable eligibility filter (tenure, grade, exclusions) is a natural
// follow-up but out of scope for this pass.
export async function addAllEmployeesToReviewCycle(cycleId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const { data: cycle } = await supabase.from("compensation_review_cycles").select("id, status").eq("id", cycleId).eq("org_id", orgId).maybeSingle();
  if (!cycle) throw new Error("Review cycle not found.");

  const { data: employees } = await supabase.from("employees").select("id").eq("org_id", orgId).eq("status", "Active");
  const rows = (employees ?? []).map((e: { id: string }) => ({ review_cycle_id: cycleId, org_id: orgId, employee_id: e.id }));
  if (rows.length > 0) {
    await supabase.from("compensation_review_items").upsert(rows, { onConflict: "review_cycle_id,employee_id", ignoreDuplicates: true });
  }
  await supabase.from("compensation_review_cycles").update({ status: "open" }).eq("id", cycleId);

  revalidatePath(`/dashboard/compensation/reviews/${cycleId}`);
}

// Manager submits a recommended increase percentage for their own report.
export async function submitManagerRecommendation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const itemId = String(formData.get("item_id") || "");
  const pct = Number(formData.get("manager_recommendation_pct") || 0);
  const comment = String(formData.get("manager_comment") || "") || null;

  const { error } = await supabase
    .from("compensation_review_items")
    .update({ manager_recommendation_pct: pct, manager_comment: comment, status: "recommended" })
    .eq("id", itemId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/manager/compensation");
}

// HR calibrates (can adjust the manager's recommendation) during the
// calibration step.
export async function calibrateReviewItem(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const itemId = String(formData.get("item_id") || "");
  const pct = Number(formData.get("hr_decision_pct") || 0);
  const comment = String(formData.get("hr_comment") || "") || null;

  const { error } = await supabase
    .from("compensation_review_items")
    .update({ hr_decision_pct: pct, hr_comment: comment, status: "calibrated" })
    .eq("id", itemId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/compensation/reviews`);
}

// HR approval of a calibrated item: creates a compensation_change_request
// (basic = current basic * (1 + hr_decision_pct/100)) and applies it
// immediately if the cycle's effective date has arrived, else schedules it
// for the Area 17 cron. See module header for why this bypasses a second
// approval_requests row.
export async function approveReviewItem(itemId: string) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const { data: item } = await supabase
    .from("compensation_review_items")
    .select("id, org_id, employee_id, hr_decision_pct, compensation_review_cycles(period_start)")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!item) throw new Error("Review item not found.");
  if (item.hr_decision_pct === null) throw new Error("Calibrate this item before approving.");

  const { data: employee } = await supabase.from("employees").select("basic").eq("id", item.employee_id).single();
  if (!employee) throw new Error("Employee not found.");
  const newBasic = Number(employee.basic) * (1 + Number(item.hr_decision_pct) / 100);
  const cycle = item.compensation_review_cycles as unknown as { period_start: string } | null;
  const effectiveFrom = cycle?.period_start && cycle.period_start > today() ? cycle.period_start : today();

  const { data: changeRequest, error } = await supabase
    .from("compensation_change_requests")
    .insert({
      org_id: orgId,
      employee_id: item.employee_id,
      requested_by: userId,
      status: "approved",
      proposed_basic: Math.round(newBasic * 100) / 100,
      effective_from: effectiveFrom,
      reason: `Annual compensation review — ${item.hr_decision_pct}% adjustment`,
      review_item_id: itemId,
      decided_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("compensation_review_items").update({ change_request_id: changeRequest.id, status: "approved" }).eq("id", itemId);

  if (effectiveFrom <= today()) {
    await applyCompensationChange(supabase, changeRequest.id, userId);
  } else {
    await supabase.from("compensation_change_requests").update({ status: "scheduled" }).eq("id", changeRequest.id);
  }

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "compensation_review_item.approved",
    resourceType: "compensation_review_item",
    resourceId: itemId,
    eventCategory: "approval",
    riskLevel: "elevated",
  });

  revalidatePath("/dashboard/compensation/reviews");
}

export async function closeReviewCycle(cycleId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("compensation_review_cycles").update({ status: "closed" }).eq("id", cycleId).eq("org_id", orgId);
  revalidatePath(`/dashboard/compensation/reviews/${cycleId}`);
}
