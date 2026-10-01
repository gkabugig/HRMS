import type { SupabaseClient } from "@supabase/supabase-js";
import { writeDocumentEvent } from "./events";

// Internal helper (not a Server Action — takes a live SupabaseClient, so it
// is never exported from a "use server" module). Called from the
// version-issuing path in lifecycle.ts when a document's type is
// configured to reset acknowledgements on a new version: opens a fresh
// 'pending' row for the employee, rather than carrying over whatever
// acknowledgement state the previous version had (spec §21: "new versions
// can reset per type policy").
export async function requestAcknowledgement(
  supabase: SupabaseClient,
  input: { orgId: string; documentId: string; employeeId: string; versionId: string }
): Promise<void> {
  const { error } = await supabase.from("document_acknowledgements").upsert(
    {
      org_id: input.orgId,
      document_id: input.documentId,
      employee_id: input.employeeId,
      version_id: input.versionId,
      status: "pending",
    },
    { onConflict: "document_id,employee_id,version_id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
  await writeDocumentEvent(supabase, {
    orgId: input.orgId,
    documentId: input.documentId,
    versionId: input.versionId,
    eventType: "document.acknowledgement_requested",
    metadata: { employeeId: input.employeeId },
  });
}
