"use server";

// Area 11 Workforce Risk Centre actions. §6.8 security: Area 01
// authorization + Area 04 scope, risk acceptance requires authorised
// actor + rationale + expiry/review date, evidence inherits source
// confidentiality (we never expose evidence_json beyond what RLS already
// permits for the viewer).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { processEventImmediately } from "@/lib/notifications/scheduler";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRiskScan } from "./run-risk-scan";

const VALID_STATUSES = [
  "detected", "triaged", "assigned", "investigating", "remediation_required",
  "resolved", "verified", "closed", "dismissed", "duplicate", "accepted",
];

async function requireAdminOrHr(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only admin/HR can manage the Workforce Risk Centre.");
  }
  return { userId: user.id, orgId: appUser.org_id as string };
}

export async function triggerRiskScan() {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const result = await runRiskScan(supabase, orgId, userId);
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "risk.scan_run",
    resourceType: "workforce_risks",
    resourceId: null,
    eventCategory: "configuration",
    metadata: result,
  });
  revalidatePath("/dashboard/risk");
  return result;
}

export async function updateRiskStatus(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const riskId = formData.get("risk_id") as string;
  const toStatus = formData.get("status") as string;
  const note = (formData.get("note") as string) || null;
  if (!VALID_STATUSES.includes(toStatus)) throw new Error("Invalid status.");

  const { data: risk } = await supabase.from("workforce_risks").select("id, status, rule_code").eq("id", riskId).eq("org_id", orgId).maybeSingle();
  if (!risk) throw new Error("Risk not found.");

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "resolved") patch.resolved_at = new Date().toISOString();
  if (toStatus === "verified") patch.verified_at = new Date().toISOString();
  if (toStatus === "closed") patch.closed_at = new Date().toISOString();

  if (toStatus === "accepted") {
    const rationale = formData.get("acceptance_rationale") as string;
    const expiry = formData.get("acceptance_expiry") as string;
    if (!rationale || !expiry) {
      throw new Error("Risk acceptance requires a rationale and an expiry/review date (§6.8).");
    }
    patch.acceptance_rationale = rationale;
    patch.acceptance_expiry = expiry;
    patch.accepted_by = userId;
  }

  const { error } = await supabase.from("workforce_risks").update(patch).eq("id", riskId).eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await supabase.from("workforce_risk_events").insert({
    risk_id: riskId,
    event_type: "status_change",
    from_status: risk.status,
    to_status: toStatus,
    actor_user_id: userId,
    note,
  });

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "risk.status_changed",
    resourceType: "workforce_risks",
    resourceId: riskId,
    eventCategory: "configuration",
    riskLevel: toStatus === "accepted" ? "elevated" : "normal",
    before: { status: risk.status },
    after: { status: toStatus },
  });

  if (toStatus === "resolved" || toStatus === "verified" || toStatus === "closed") {
    const admin = createAdminClient();
    const eventId = await emitNotificationEvent(supabase, {
      orgId,
      eventType: "risk.resolved",
      aggregateType: "workforce_risk",
      aggregateId: riskId,
      actorId: userId,
      idempotencyKey: `risk-resolved:${riskId}:${toStatus}`,
      payload: { riskId, ruleCode: risk.rule_code, status: toStatus },
    });
    if (eventId) await processEventImmediately(admin, eventId).catch((err) => console.error("processEventImmediately failed:", err));
  }

  revalidatePath("/dashboard/risk");
  revalidatePath(`/dashboard/risk/${riskId}`);
}

export async function assignRiskOwner(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const riskId = formData.get("risk_id") as string;
  const ownerUserId = formData.get("owner_user_id") as string;

  const { data: owner } = await supabase.from("app_users").select("id, role").eq("id", ownerUserId).eq("org_id", orgId).maybeSingle();
  if (!owner) throw new Error("Owner must be a member of this organisation.");

  const { error } = await supabase
    .from("workforce_risks")
    .update({ owner_user_id: ownerUserId, owner_role: owner.role, status: "assigned" })
    .eq("id", riskId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await supabase.from("workforce_risk_events").insert({
    risk_id: riskId,
    event_type: "owner_assigned",
    to_status: "assigned",
    actor_user_id: userId,
    note: `Assigned to ${ownerUserId}.`,
  });

  revalidatePath("/dashboard/risk");
  revalidatePath(`/dashboard/risk/${riskId}`);
}

export async function addRiskComment(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const riskId = formData.get("risk_id") as string;
  const body = formData.get("body") as string;
  const visibility = (formData.get("visibility") as string) === "employee_visible" ? "employee_visible" : "internal";
  if (!body) throw new Error("Comment body is required.");

  const { data: risk } = await supabase.from("workforce_risks").select("id").eq("id", riskId).eq("org_id", orgId).maybeSingle();
  if (!risk) throw new Error("Risk not found.");

  const { error } = await supabase.from("workforce_risk_comments").insert({ risk_id: riskId, author_user_id: userId, body, visibility });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/risk/${riskId}`);
}

export async function createRiskAction(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const riskId = formData.get("risk_id") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const assignedTo = (formData.get("assigned_to") as string) || null;
  const dueAt = (formData.get("due_at") as string) || null;
  if (!title) throw new Error("Title is required.");

  const { data: risk } = await supabase.from("workforce_risks").select("id").eq("id", riskId).eq("org_id", orgId).maybeSingle();
  if (!risk) throw new Error("Risk not found.");

  const { error } = await supabase.from("workforce_risk_actions").insert({
    risk_id: riskId,
    title,
    description,
    assigned_to: assignedTo,
    due_at: dueAt,
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  await supabase.from("workforce_risks").update({ status: "remediation_required" }).eq("id", riskId).eq("org_id", orgId).in("status", ["detected", "triaged", "assigned", "investigating"]);
  await supabase.from("workforce_risk_events").insert({ risk_id: riskId, event_type: "action_created", actor_user_id: userId, note: title });

  revalidatePath(`/dashboard/risk/${riskId}`);
}

export async function completeRiskAction(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const actionId = formData.get("action_id") as string;
  const riskId = formData.get("risk_id") as string;

  const { error } = await supabase
    .from("workforce_risk_actions")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", actionId);
  if (error) throw new Error(error.message);

  await supabase.from("workforce_risk_events").insert({ risk_id: riskId, event_type: "action_completed", actor_user_id: userId });
  revalidatePath(`/dashboard/risk/${riskId}`);
  void orgId;
}

export async function createRiskSuppression(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const ruleId = formData.get("rule_id") as string;
  const entityType = formData.get("entity_type") as string;
  const entityId = (formData.get("entity_id") as string) || null;
  const reason = formData.get("reason") as string;
  const endsAt = formData.get("ends_at") as string;
  if (!reason || !endsAt) throw new Error("Suppression requires a reason and an end date (§6.8).");

  const { error } = await supabase.from("workforce_risk_suppressions").insert({
    org_id: orgId,
    rule_id: ruleId,
    entity_type: entityType,
    entity_id: entityId,
    reason,
    authorised_by: userId,
    ends_at: endsAt,
  });
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "risk.suppression_created",
    resourceType: "workforce_risk_suppressions",
    resourceId: null,
    eventCategory: "configuration",
    riskLevel: "elevated",
    metadata: { ruleId, entityType, entityId, reason, endsAt },
  });

  revalidatePath("/dashboard/risk/rules");
}
