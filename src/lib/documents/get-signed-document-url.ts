"use server";

// Thin backward-compatible wrapper, kept so existing call sites
// (me/documents/view-document-button.tsx, me/documents/page.tsx) don't need
// to change their import path. The real implementation now lives in the
// Area 08 access/acknowledgement services, which add authorization-call
// clarity, version-awareness and document_events auditing on top of what
// this file used to do inline.
import { createClient } from "@/lib/supabase/server";
import { getDocumentAccess } from "./access";
import { acknowledgeDocumentVersion } from "./acknowledgements";

export async function getSignedDocumentUrl(documentId: string, action: "view" | "download" = "view"): Promise<string> {
  const supabase = await createClient();
  const { url } = await getDocumentAccess(supabase, { documentId, action });
  return url;
}

export async function acknowledgeDocument(documentId: string): Promise<void> {
  await acknowledgeDocumentVersion(documentId, null);
}
