import type { SupabaseClient } from "@supabase/supabase-js";
import { processNotificationEvent } from "./orchestrator";

// Claims a batch of pending notification_events (via the SKIP LOCKED RPC)
// and runs each through the orchestrator. Used by:
//   - /api/cron/notifications-process (the safety-net sweep — catches
//     anything a synchronous call missed, e.g. the request died before
//     getting to processImmediately, or a future event-emitting call site
//     chooses fire-and-forget emission only).
//   - processEventsImmediately below, called right after emitNotificationEvent
//     in the handful of Server Actions wired to the new governed pipeline,
//     so the in-app notification appears with the same latency the old
//     synchronous system had — the durability guarantee still comes from
//     the outbox row existing either way.
export async function processPendingNotificationEvents(admin: SupabaseClient, limit = 50): Promise<number> {
  const { data: claimed, error } = await admin.rpc("claim_pending_notification_events", { p_limit: limit });
  if (error) throw new Error(error.message);
  const events = (claimed as Parameters<typeof processNotificationEvent>[1][] | null) ?? [];
  for (const event of events) {
    await processNotificationEvent(admin, event);
  }
  return events.length;
}

// Best-effort immediate processing of one just-emitted event, by id —
// used right after emitNotificationEvent so the recipient doesn't wait
// for the next cron tick to see an in-app notification. If this throws
// or the event was already claimed by a concurrent cron run, the event
// stays durably in the outbox either way (processed or still pending),
// so the caller treats this as fire-and-forget.
export async function processEventImmediately(admin: SupabaseClient, eventId: string): Promise<void> {
  const { data: event } = await admin.from("notification_events").select("*").eq("id", eventId).eq("processing_status", "pending").maybeSingle();
  if (!event) return;
  // Guard against a concurrent cron sweep claiming the same event: only
  // proceed if THIS update is the one that flipped pending → processing.
  const { data: claimed } = await admin
    .from("notification_events")
    .update({ processing_status: "processing" })
    .eq("id", eventId)
    .eq("processing_status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return;
  await processNotificationEvent(admin, event as Parameters<typeof processNotificationEvent>[1]);
}
