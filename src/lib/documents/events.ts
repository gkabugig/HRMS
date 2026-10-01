import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentEventType } from "./types";

// Area 08 §28 — the business-timeline audit trail. Distinct from the
// simpler, access-only document_access_logs (view/download hits only,
// kept as-is for the existing signed-URL call sites): document_events
// carries every material lifecycle and access event, with actor, org,
// document/version, event type, timestamp and safe metadata, per the
// spec's "every material lifecycle/access event must be auditable" rule.
//
// Never pass raw file bytes, signed URLs, or unvalidated user input as
// metadata — this table is read back into timelines shown to the
// document's owner, so metadata must stay to safe, already-authorized
// summary fields (a filename, a version number, a decision reason).
export async function writeDocumentEvent(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    documentId: string;
    versionId?: string | null;
    eventType: DocumentEventType;
    actorId?: string | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await supabase.from("document_events").insert({
    org_id: input.orgId,
    document_id: input.documentId,
    version_id: input.versionId ?? null,
    event_type: input.eventType,
    actor_id: input.actorId ?? null,
    metadata: input.metadata ?? {},
  });
  // Audit writes are best-effort in the sense that a failure here must
  // never block the underlying business action (which has already
  // committed), but it must never be silent either.
  if (error) {
    console.error(`document_events insert failed for ${input.documentId}/${input.eventType}:`, error.message);
  }
}

export async function getDocumentTimeline(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from("document_events")
    .select("id, event_type, actor_id, metadata, created_at, version_id, app_users:actor_id(employees(name))")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const actor = row.app_users as unknown as { employees: { name: string } | null } | null;
    return {
      id: row.id as string,
      eventType: row.event_type as DocumentEventType,
      actorId: row.actor_id as string | null,
      actorName: actor?.employees?.name ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      versionId: row.version_id as string | null,
      createdAt: row.created_at as string,
    };
  });
}
