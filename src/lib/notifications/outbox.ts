import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventDefinition } from "./event-catalogue";

// Area 09 §9 Event Capture / Transactional Outbox.
//
// This codebase's Server Actions never wrap a business write and a
// follow-on insert in a single Postgres transaction from the JS client —
// that's true of every existing notification call site (the Area 09
// survey confirmed none of start-approval.ts/escalate-step.ts/
// lifecycle.ts/expiry.ts/service-requests actions.ts use `begin`/`commit`
// around their notification side effect either). Introducing real
// client-side transactions here, for only this one subsystem, would be a
// bigger and riskier architectural change than Area 09 itself. Instead,
// durability comes from a different property: emitNotificationEvent is
// called immediately after the business write, on the same request, and
// is itself idempotent (unique(org_id, idempotency_key) + on-conflict
// no-op) — so even if the request dies between the business write and
// this call, a retry of the whole action (which this app's forms already
// require on failure) safely reconstructs the missing event without ever
// double-firing it once it did get written. A true DB-transaction outbox
// is listed as a residual gap in the Area 09 summary.
export type EmitEventInput = {
  orgId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string | null;
  correlationId?: string;
  /** Deterministic — see spec §16. Caller supplies the business-unique
   * part (e.g. `${requestId}:${stepId}`); this function does not invent
   * one, since only the caller knows what makes the event unique. */
  idempotencyKey: string;
  payload: Record<string, unknown>;
};

export async function emitNotificationEvent(
  supabase: SupabaseClient,
  input: EmitEventInput
): Promise<string | null> {
  const def = getEventDefinition(input.eventType);
  if (def) {
    const missing = def.requiredPayloadFields.filter((f) => !(f in input.payload));
    if (missing.length > 0) {
      console.error(`emitNotificationEvent: event ${input.eventType} missing payload fields: ${missing.join(", ")}`);
      return null;
    }
  }

  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      org_id: input.orgId,
      event_type: input.eventType,
      aggregate_type: input.aggregateType ?? null,
      aggregate_id: input.aggregateId ?? null,
      actor_id: input.actorId ?? null,
      correlation_id: input.correlationId ?? undefined,
      idempotency_key: input.idempotencyKey,
      payload: input.payload,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // A conflict on the unique key means this exact event was already
    // captured (duplicate business retry) — that's success, not failure.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("notification_events")
        .select("id")
        .eq("org_id", input.orgId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      return existing?.id ?? null;
    }
    console.error("emitNotificationEvent insert failed:", error.message);
    return null;
  }

  return data?.id ?? null;
}
