import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRecipients } from "./recipient-resolver";
import { resolvePolicy, resolveChannelPlan } from "./policy";
import { resolveTemplate } from "./templates";
import { createNotification } from "./create-notification";
import type { NotificationCategory, NotificationPriority } from "./notification-types";
import { maskDestination, lookupDestination } from "./channels/destinations";

type NotificationEventRow = {
  id: string;
  org_id: string;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  actor_id: string | null;
  correlation_id: string;
  payload: Record<string, unknown>;
};

// Area 09 §10 Notification Orchestration Service — the
// processNotificationEvent pipeline from the spec, adapted to this repo's
// existing building blocks (resolveRecipients re-authorizes at
// processing time; resolveChannelPlan applies the full preference/policy
// hierarchy; createNotification is the same RLS-safe, dedupe-by-unique-
// constraint helper every legacy call site already uses).
//
// Always called with a service-role (admin) client: it must read/write
// across every recipient's own preferences and deliveries, which no
// single user's RLS session could do. Business modules never call this
// directly from a Server Action — they call emitNotificationEvent (their
// own per-request client) and this function is invoked either
// immediately after (best-effort, for in-app UX parity with the old
// synchronous system) or later by the cron sweep — both converge on the
// same idempotent, re-authorizing pipeline.
export async function processNotificationEvent(admin: SupabaseClient, event: NotificationEventRow): Promise<void> {
  try {
    const policy = await resolvePolicy(admin, event.org_id, event.event_type);
    const recipients = await resolveRecipients(admin, event.org_id, event.event_type, event.aggregate_id, event.payload);

    const { data: org } = await admin.from("organizations").select("default_timezone").eq("id", event.org_id).maybeSingle();

    for (const recipientUserId of recipients) {
      await deliverToRecipient(admin, event, policy, recipientUserId, org?.default_timezone ?? "en-KE");
    }

    await admin
      .from("notification_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", event.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("notification_events")
      .update({
        processing_status: "failed",
        processing_error: message,
        attempt_count: await incrementAttempt(admin, event.id),
      })
      .eq("id", event.id);
  }
}

async function incrementAttempt(admin: SupabaseClient, eventId: string): Promise<number> {
  const { data } = await admin.from("notification_events").select("attempt_count").eq("id", eventId).maybeSingle();
  return (data?.attempt_count ?? 0) + 1;
}

async function deliverToRecipient(
  admin: SupabaseClient,
  event: NotificationEventRow,
  policy: Awaited<ReturnType<typeof resolvePolicy>>,
  recipientUserId: string,
  orgDefaultLocale: string
): Promise<void> {
  const channelPlan = await resolveChannelPlan(admin, event.org_id, recipientUserId, policy);
  const inAppDecision = channelPlan.find((c) => c.channel === "in_app");
  if (!inAppDecision || !inAppDecision.send) return; // suppressed/opted-out even for in-app — nothing to create.

  const variables = { ...event.payload, orgId: event.org_id };
  const inAppContent = await resolveTemplate(admin, event.org_id, event.event_type, "in_app", null, orgDefaultLocale, variables);

  const correlationId = event.correlation_id;
  const requiresAction = policy.priority === "action_required" || policy.priority === "critical";

  let notificationId = await createNotification(admin, {
    orgId: event.org_id,
    recipientUserId,
    type: event.event_type,
    category: policy.category as NotificationCategory,
    priority: policy.priority as NotificationPriority,
    title: inAppContent.title,
    message: inAppContent.body,
    entityType: event.aggregate_type ?? undefined,
    entityId: event.aggregate_id ?? undefined,
    actionUrl: inAppContent.actionUrl ?? undefined,
    actionLabel: inAppContent.actionLabel ?? undefined,
    safePreview: inAppContent.safePreview ?? undefined,
    eventId: event.id,
    templateId: inAppContent.templateId ?? undefined,
    correlationId,
    requiresAction,
    isMandatory: policy.mandatory,
    scheduledFor: inAppDecision.scheduledFor.toISOString(),
  });

  if (!notificationId) {
    // Dedupe conflict — a notification for this (recipient, type, entity)
    // already exists (an earlier partial run, or the legacy direct path).
    // Still need to make sure non-in-app channels get queued below, so
    // look the existing row up instead of silently stopping here.
    let existingQuery = admin
      .from("notifications")
      .select("id")
      .eq("recipient_user_id", recipientUserId)
      .eq("type", event.event_type);
    existingQuery = event.aggregate_type ? existingQuery.eq("entity_type", event.aggregate_type) : existingQuery.is("entity_type", null);
    existingQuery = event.aggregate_id ? existingQuery.eq("entity_id", event.aggregate_id) : existingQuery.is("entity_id", null);
    const { data: existing } = await existingQuery.maybeSingle();
    notificationId = existing?.id ?? null;
  }
  if (!notificationId) return;

  for (const decision of channelPlan) {
    if (decision.channel === "in_app" || !decision.send) continue;
    const destination = await lookupDestination(admin, decision.channel, recipientUserId);
    if (!destination) continue;

    await admin
      .from("notification_deliveries")
      .upsert(
        {
          notification_id: notificationId,
          channel: decision.channel,
          destination_masked: maskDestination(decision.channel, destination),
          status: decision.digestGroup ? "digested" : "queued",
          next_retry_at: decision.digestGroup ? null : decision.scheduledFor.toISOString(),
          digest_group: decision.digestGroup ?? null,
        },
        { onConflict: "notification_id,channel", ignoreDuplicates: true }
      );
  }
}
