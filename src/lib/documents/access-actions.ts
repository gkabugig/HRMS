"use server";

import { createClient } from "@/lib/supabase/server";
import { getDocumentAccess } from "./access";

export async function getDocumentViewUrl(documentId: string, versionId?: string | null): Promise<string> {
  const supabase = await createClient();
  const { url } = await getDocumentAccess(supabase, { documentId, versionId, action: "view" });
  return url;
}
