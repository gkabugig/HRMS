import type { SupabaseClient } from "@supabase/supabase-js";

// Shared event log (spec §29). Deliberately not a pub/sub bus — nothing in
// this app runs a background worker, so "subscribers" (the notification
// engine, the audit trail) are just called directly, right next to this,
// from the same server action. This table exists so those events still
// have one durable, queryable record instead of being scattered across
// employee_audit_log/payroll_audit_log/notifications with no shared shape.
export async function logDomainEvent(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    eventType: string;
    entityType?: string;
    entityId?: string;
    actorId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("domain_events").insert({
    org_id: params.orgId,
    event_type: params.eventType,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    actor_id: params.actorId ?? null,
    payload_json: params.payload ?? {},
  });
}
