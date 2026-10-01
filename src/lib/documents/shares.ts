import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { writeDocumentEvent } from "./events";

// Area 08 §2/§9 Temporary Shares. The document_shares table (migration
// 0079) never stores a permanent public URL — only an opaque token. A
// short-lived signed URL is minted only at redemption time, by
// redeemDocumentShare() below, which runs under the service-role admin
// client (the recipient of a share link has no HRMS login, so there is no
// RLS-scoped session to redeem it under) and independently re-checks
// expiry/revocation/max-views on every single redemption — a share is
// capability-based, not identity-based, so those checks are the entire
// security boundary and must never be skipped.
const SHARE_SIGNED_URL_TTL_SECONDS = 300;

export function generateShareToken(): string {
  return randomBytes(24).toString("hex");
}

export async function createDocumentShare(
  supabase: SupabaseClient,
  input: { documentId: string; versionId?: string | null; createdBy: string; expiresInHours: number; maxViews?: number | null }
): Promise<{ token: string; expiresAt: string }> {
  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("document_shares").insert({
    document_id: input.documentId,
    version_id: input.versionId ?? null,
    token,
    created_by: input.createdBy,
    expires_at: expiresAt,
    max_views: input.maxViews ?? null,
  });
  if (error) throw new Error(error.message);

  const { data: doc } = await supabase.from("employee_documents").select("employees(org_id)").eq("id", input.documentId).maybeSingle();
  const orgRow = doc?.employees as unknown as { org_id: string } | { org_id: string }[] | null;
  const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
  if (orgId) {
    await writeDocumentEvent(supabase, {
      orgId,
      documentId: input.documentId,
      versionId: input.versionId ?? null,
      eventType: "document.shared",
      actorId: input.createdBy,
      metadata: { expiresAt, maxViews: input.maxViews ?? null },
    });
  }

  return { token, expiresAt };
}

export async function revokeDocumentShare(supabase: SupabaseClient, shareId: string, actorId: string): Promise<void> {
  const { data: share, error } = await supabase
    .from("document_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId)
    .select("document_id, version_id, employee_documents(employees(org_id))")
    .single();
  if (error || !share) throw new Error(error?.message ?? "Share not found.");

  const nested = share.employee_documents as unknown as { employees: { org_id: string } | { org_id: string }[] | null } | null;
  const orgRow = nested?.employees;
  const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
  if (orgId) {
    await writeDocumentEvent(supabase, {
      orgId,
      documentId: share.document_id as string,
      versionId: share.version_id as string | null,
      eventType: "document.share_revoked",
      actorId,
    });
  }
}

// Called from the public, unauthenticated redemption route with the
// service-role admin client. Fails closed on every check — an invalid,
// revoked, expired, or exhausted token always returns null, never a path.
export async function redeemDocumentShare(
  supabase: SupabaseClient,
  token: string
): Promise<{ url: string; fileName: string } | null> {
  const { data: share } = await supabase
    .from("document_shares")
    .select("id, document_id, version_id, expires_at, revoked_at, max_views, view_count")
    .eq("token", token)
    .maybeSingle();
  if (!share) return null;
  if (share.revoked_at) return null;
  if (new Date(share.expires_at) < new Date()) return null;
  if (share.max_views !== null && share.view_count >= share.max_views) return null;

  let filePath: string;
  let fileName: string;
  if (share.version_id) {
    const { data: version } = await supabase
      .from("document_versions")
      .select("file_path, file_name")
      .eq("id", share.version_id)
      .maybeSingle();
    if (!version) return null;
    filePath = version.file_path as string;
    fileName = version.file_name as string;
  } else {
    const { data: doc } = await supabase
      .from("employee_documents")
      .select("file_path, file_name")
      .eq("id", share.document_id)
      .maybeSingle();
    if (!doc) return null;
    filePath = doc.file_path as string;
    fileName = doc.file_name as string;
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(filePath, SHARE_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) return null;

  await supabase.from("document_shares").update({ view_count: share.view_count + 1 }).eq("id", share.id);

  const { data: doc } = await supabase.from("employee_documents").select("employees(org_id)").eq("id", share.document_id).maybeSingle();
  const orgRow = doc?.employees as unknown as { org_id: string } | { org_id: string }[] | null;
  const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
  if (orgId) {
    await writeDocumentEvent(supabase, {
      orgId,
      documentId: share.document_id as string,
      versionId: share.version_id as string | null,
      eventType: "document.downloaded",
      metadata: { viaShare: true },
    });
  }

  return { url: signed.signedUrl, fileName };
}
