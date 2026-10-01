import type { SupabaseClient } from "@supabase/supabase-js";

// Durable outbox write (Area 03 spec §9/§19.D). Every business event that
// might drive a configured workflow is recorded here first — even though,
// in this scope, the only caller processes it synchronously right after —
// so a crash between the insert and the processing step still leaves a
// 'pending' row for /api/cron/workflow-events to pick up later instead of
// silently losing the event.
export type PublishEventInput = {
  orgId: string;
  eventName: string; // e.g. "employee_data_change.requested"
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
};

export async function publishEvent(supabase: SupabaseClient, input: PublishEventInput): Promise<string> {
  const { data, error } = await supabase
    .from("workflow_events")
    .insert({
      org_id: input.orgId,
      event_name: input.eventName,
      entity_type: input.entityType,
      entity_id: input.entityId,
      payload_json: input.payload ?? {},
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to publish workflow event.");
  return data.id as string;
}
