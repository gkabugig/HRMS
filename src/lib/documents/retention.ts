import type { SupabaseClient } from "@supabase/supabase-js";

// Area 08 §27 Retention & Legal Hold. A document under legal hold, or still
// inside its retention window, must never be voided, archived, or deleted
// without an explicit, logged override — this is the one gate every
// destructive/lifecycle-ending lifecycle.ts action calls through first.
export async function assertNotUnderRetentionHold(
  supabase: SupabaseClient,
  documentId: string,
  options?: { allowOverride?: boolean }
): Promise<void> {
  const { data: doc, error } = await supabase
    .from("employee_documents")
    .select("legal_hold, retention_until")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) throw new Error("Document not found.");

  if (doc.legal_hold && !options?.allowOverride) {
    throw new Error("This document is under legal hold and cannot be modified or removed.");
  }
  if (doc.retention_until) {
    const retentionUntil = new Date(doc.retention_until as string);
    if (retentionUntil.getTime() > Date.now() && !options?.allowOverride) {
      throw new Error(`This document is under retention until ${doc.retention_until} and cannot be removed yet.`);
    }
  }
}

export async function setRetention(
  supabase: SupabaseClient,
  input: { documentId: string; retentionUntil: string | null; legalHold: boolean; actorId: string; orgId: string }
): Promise<void> {
  const { error } = await supabase
    .from("employee_documents")
    .update({ retention_until: input.retentionUntil, legal_hold: input.legalHold })
    .eq("id", input.documentId);
  if (error) throw new Error(error.message);

  const { writeDocumentEvent } = await import("./events");
  await writeDocumentEvent(supabase, {
    orgId: input.orgId,
    documentId: input.documentId,
    eventType: "document.retention_changed",
    actorId: input.actorId,
    metadata: { retentionUntil: input.retentionUntil, legalHold: input.legalHold },
  });
}

// Applies a document type's configured retention period (months) to a
// newly-issued version's retention_until, when the type has one set and no
// explicit retention is already in force. Never hard-codes a duration —
// reads it from document_types.retention_period_months.
export function computeRetentionUntil(issuedAt: Date, retentionPeriodMonths: number | null): string | null {
  if (!retentionPeriodMonths) return null;
  const until = new Date(issuedAt);
  until.setMonth(until.getMonth() + retentionPeriodMonths);
  return until.toISOString().slice(0, 10);
}
