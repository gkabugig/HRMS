"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { setRetention } from "./retention";

export async function updateDocumentRetention(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can change retention settings.");

  const documentId = String(formData.get("document_id") || "");
  if (!documentId) throw new Error("Missing document.");
  const retentionUntil = String(formData.get("retention_until") || "") || null;
  const legalHold = formData.get("legal_hold") === "on";

  await setRetention(supabase, { documentId, retentionUntil, legalHold, actorId: user.id, orgId: appUser.org_id });
  revalidatePath(`/dashboard/documents/${documentId}`);
}
