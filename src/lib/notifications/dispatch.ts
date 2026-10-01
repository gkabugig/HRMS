import type { SupabaseClient } from "@supabase/supabase-js";
import { channelAdapters } from "./channels";
import { resolveTemplate } from "./templates";
import { lookupDestination } from "./channels/destinations";

const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 3600]; // §15, verbatim from spec

function nextRetryAt(attempt: number): Date | null {
  if (attempt >= RETRY_DELAYS_SECONDS.length) return null;
  return new Date(Date.now() + RETRY_DELAYS_SECONDS[attempt] * 1000);
}

// Area 09 §15 Delivery, Retry and Dead-Letter Rules + §18 scheduler.
// Claims a batch of due `notification_deliveries` rows (claim_queued_
// deliveries does the FOR UPDATE SKIP LOCKED work), sends each through
// its channel adapter, and applies the retry/dead-letter state machine.
// Called from the /api/cron/notifications-dispatch route.
export async function dispatchQueuedDeliveries(admin: SupabaseClient, limit = 100): Promise<{ sent: number; failed: number; deadLettered: number }> {
  const { data: claimed, error } = await admin.rpc("claim_queued_deliveries", { p_limit: limit });
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const delivery of (claimed as DeliveryRow[] | null) ?? []) {
    const result = await sendOne(admin, delivery);
    if (result === "sent") sent++;
    else if (result === "dead_letter") deadLettered++;
    else failed++;
  }

  return { sent, failed, deadLettered };
}

type DeliveryRow = {
  id: string;
  notification_id: string;
  channel: string;
  attempt_count: number;
};

async function sendOne(admin: SupabaseClient, delivery: DeliveryRow): Promise<"sent" | "retry" | "dead_letter"> {
  const { data: notification } = await admin
    .from("notifications")
    .select("id, org_id, recipient_user_id, event_id, type, title, message, safe_preview, action_url, action_label, is_mandatory")
    .eq("id", delivery.notification_id)
    .maybeSingle();

  if (!notification) {
    await admin.from("notification_deliveries").update({ status: "failed", failed_at: new Date().toISOString(), error_code: "notification_missing" }).eq("id", delivery.id);
    return "dead_letter";
  }

  const destination = await lookupDestination(admin, delivery.channel, notification.recipient_user_id);
  if (!destination) {
    return await fail(admin, delivery, notification, "no_destination", "No destination address on file for this channel.", false);
  }

  const [{ data: org }, { data: eventRow }] = await Promise.all([
    admin.from("organizations").select("default_timezone").eq("id", notification.org_id).maybeSingle(),
    notification.event_id ? admin.from("notification_events").select("payload").eq("id", notification.event_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rendered = await resolveTemplate(admin, notification.org_id, notification.type, delivery.channel, null, org?.default_timezone ?? "en-KE", {
    ...(eventRow?.payload as Record<string, unknown> | undefined),
    defaultTitle: notification.title,
    defaultMessage: notification.safe_preview ?? notification.message,
    defaultActionUrl: notification.action_url,
  });

  const adapter = channelAdapters[delivery.channel];
  if (!adapter) {
    return await fail(admin, delivery, notification, "unknown_channel", `No adapter for channel ${delivery.channel}`, false);
  }

  const result = await adapter.send({
    notificationId: notification.id,
    destination,
    // External channels only ever see the safe preview / rendered
    // template, never the internal `message` field directly (spec §2/
    // §29 — "Sensitive HR content must be minimized in external
    // channels"). rendered.body comes from a template keyed to this exact
    // channel+event_type; if none was authored, templates.ts's built-in
    // fallback uses safe_preview/defaultMessage, never raw internal body.
    title: rendered.title || notification.title,
    body: rendered.body || notification.safe_preview || "You have a new HRMS notification. Sign in to review it.",
    actionUrl: rendered.actionUrl ?? notification.action_url ?? undefined,
    actionLabel: rendered.actionLabel ?? notification.action_label ?? undefined,
  });

  if (result.accepted) {
    await admin
      .from("notification_deliveries")
      .update({
        status: "sent",
        delivered_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId ?? null,
        attempt_count: delivery.attempt_count + 1,
      })
      .eq("id", delivery.id);
    return "sent";
  }

  return await fail(admin, delivery, notification, result.errorCode ?? "send_failed", result.errorMessage ?? "Delivery failed.", result.retryable ?? false);
}

async function fail(
  admin: SupabaseClient,
  delivery: DeliveryRow,
  notification: { id: string; org_id: string; is_mandatory: boolean },
  errorCode: string,
  errorMessage: string,
  retryable: boolean
): Promise<"retry" | "dead_letter"> {
  const attempt = delivery.attempt_count + 1;
  const retryAt = retryable ? nextRetryAt(delivery.attempt_count) : null;

  if (retryAt) {
    await admin
      .from("notification_deliveries")
      .update({ status: "queued", attempt_count: attempt, last_attempt_at: new Date().toISOString(), next_retry_at: retryAt.toISOString(), error_code: errorCode, error_message: errorMessage })
      .eq("id", delivery.id);
    return "retry";
  }

  // Exhausted retries (or a permanent failure) — §15 "Repeated failure →
  // move to dead-letter and surface to administrator."
  await admin
    .from("notification_deliveries")
    .update({ status: "dead_letter", attempt_count: attempt, last_attempt_at: new Date().toISOString(), failed_at: new Date().toISOString(), error_code: errorCode, error_message: errorMessage })
    .eq("id", delivery.id);
  await admin.from("notification_dead_letters").insert({
    org_id: notification.org_id,
    notification_id: notification.id,
    delivery_id: delivery.id,
    channel: delivery.channel,
    failure_reason: `${errorCode}: ${errorMessage}`,
  });
  return "dead_letter";
}
