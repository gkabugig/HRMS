"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createDocumentShare, revokeDocumentShare } from "./shares";
import { authorize } from "@/lib/authz/authorize";

export async function createShareLink(formData: FormData): Promise<{ url: string; expiresAt: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const documentId = String(formData.get("document_id") || "");
  const versionId = String(formData.get("version_id") || "") || null;
  const expiresInHours = Number(formData.get("expires_in_hours") || "24");
  const maxViews = formData.get("max_views") ? Number(formData.get("max_views")) : null;
  if (!documentId) throw new Error("Missing document.");
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0 || expiresInHours > 24 * 30) {
    throw new Error("Expiry must be between 1 hour and 30 days.");
  }

  const { data: doc } = await supabase.from("employee_documents").select("employee_id").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("Document not found.");

  const decision = await authorize(supabase, {
    resource: "documents",
    action: "export",
    sensitivity: "confidential",
    recordId: doc.employee_id,
  });
  if (!decision.allowed) throw new Error("You do not have permission to share this document.");

  const { token, expiresAt } = await createDocumentShare(supabase, {
    documentId,
    versionId,
    createdBy: user.id,
    expiresInHours,
    maxViews,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  revalidatePath(`/dashboard/documents/${documentId}`);
  return { url: `${baseUrl}/api/documents/share/${token}`, expiresAt };
}

export async function revokeShareLink(shareId: string, documentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  await revokeDocumentShare(supabase, shareId, user.id);
  revalidatePath(`/dashboard/documents/${documentId}`);
}
