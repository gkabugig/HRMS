import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePolicy } from "./policy";
import { createNotification } from "./create-notification";
import type { NotificationCategory, NotificationPriority } from "./notification-types";

// Area 09 §19 Escalation Engine.
//
// Policy-driven (notification_policy_rules.escalation_after_minutes),
// not hard-coded per-module UI logic. Sweeps unread, action-required
// notifications whose event type has an escalation threshold configured;
// for each one still unread past that threshold, creates ONE follow-up
// notification to the org's HR/admin escalation recipients, stamped with
// escalation_stage = original + 1 and escalated_from_id = original.id so
// it's a fully auditable, traceable record (spec: "should reference the
// original notification/correlation ID").
//
// Loop prevention: (a) a row is only ever escalated from once per sweep
// — checked by looking for an existing child with escalated_from_id =
// this row's id before creating another; (b) escalation_stage is capped
// at the policy's max_escalation_depth, so a chain can't grow forever
// even if HR also never acts on the escalated copy.
export async function escalateOverdueNotifications(admin: SupabaseClient, orgId: string): Promise<{ escalated: number }> {
  const { data: candidates } = await admin
    .from("notifications")
    .select("id, org_id, type, category, priority, title, message, entity_type, entity_id, action_url, correlation_id, escalation_stage, created_at, is_mandatory")
    .eq("org_id", orgId)
    .is("read_at", null)
    .is("dismissed_at", null)
    .eq("requires_action", true)
    .order("created_at", { ascending: true })
    .limit(200);

  let escalated = 0;
  for (const n of candidates ?? []) {
    const policy = await resolvePolicy(admin, orgId, n.type);
    if (!policy.escalationAfterMinutes) continue;
    if (n.escalation_stage >= policy.maxEscalationDepth) continue;

    const thresholdMs = policy.escalationAfterMinutes * 60 * 1000;
    if (Date.now() - new Date(n.created_at).getTime() < thresholdMs) continue;

    const { count: alreadyEscalated } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("escalated_from_id", n.id);
    if ((alreadyEscalated ?? 0) > 0) continue;

    const { data: hrUsers } = await admin.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]);
    for (const hr of hrUsers ?? []) {
      await createNotification(admin, {
        orgId,
        recipientUserId: hr.id as string,
        // A distinct type (not n.type) so this never collides with the
        // dedupe-by-(recipient,type,entity) unique constraint against an
        // original notification that same HR user may already hold for
        // this entity (several catalogue events already notify hr_role
        // directly) — without this, the escalation would silently no-op
        // via "on conflict do nothing" exactly when it matters most.
        type: `${n.type}.escalated`,
        category: n.category as NotificationCategory,
        priority: "critical" as NotificationPriority,
        title: `Escalated: ${n.title}`,
        message: `This item has been outstanding for over ${policy.escalationAfterMinutes} minutes without action: ${n.message}`,
        entityType: n.entity_type ?? undefined,
        entityId: n.entity_id ?? undefined,
        actionUrl: n.action_url ?? undefined,
        correlationId: n.correlation_id ?? undefined,
        requiresAction: true,
        escalationStage: (n.escalation_stage ?? 0) + 1,
        escalatedFromId: n.id,
      });
    }
    escalated++;
  }

  return { escalated };
}
