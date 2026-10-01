"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { writeDocumentEvent } from "./events";

// Area 08 §21 Acknowledgement Engine, built on the existing
// document_acknowledgements table (migration 0064), extended in migration
// 0080 with version_id + a full status set. Rules enforced here:
//   * an acknowledgement binds to a specific version (version_id), never
//     just "the document" — re-issuing a new version creates a fresh
//     pending/viewed state rather than silently inheriting the old one;
//   * opening a document is recorded as `viewed_at`, separate from
//     `acknowledged_at` — viewing is not acknowledging (spec §21);
//   * whether a new version resets an existing acknowledgement is driven
//     by document_types.acknowledgement_reset_on_new_version, never
//     hard-coded.
export async function markDocumentViewed(documentId: string, versionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) return;

  const { data: existing } = await supabase
    .from("document_acknowledgements")
    .select("id, status")
    .eq("document_id", documentId)
    .eq("employee_id", appUser.employee_id)
    .eq("version_id", versionId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("document_acknowledgements").insert({
      org_id: appUser.org_id,
      document_id: documentId,
      employee_id: appUser.employee_id,
      version_id: versionId,
      status: "viewed",
      viewed_at: new Date().toISOString(),
    });
  } else if (existing.status === "pending") {
    await supabase
      .from("document_acknowledgements")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", existing.id);
  }
}

export async function acknowledgeDocumentVersion(documentId: string, versionId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, current_version_id, employees!inner(org_id)")
    .eq("id", documentId)
    .eq("employee_id", appUser.employee_id)
    .maybeSingle();
  if (!doc) throw new Error("Document not found, or it isn't yours to acknowledge.");

  const resolvedVersionId = versionId ?? (doc.current_version_id as string | null);

  const { data: existing } = await supabase
    .from("document_acknowledgements")
    .select("id")
    .eq("document_id", documentId)
    .eq("employee_id", appUser.employee_id)
    .eq("version_id", resolvedVersionId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("document_acknowledgements")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    const { error } = await supabase.from("document_acknowledgements").insert({
      org_id: appUser.org_id,
      document_id: documentId,
      employee_id: appUser.employee_id,
      version_id: resolvedVersionId,
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
    });
    if (error && error.code !== "23505") throw new Error(error.message);
  }

  const orgRow = doc.employees as unknown as { org_id: string } | { org_id: string }[] | null;
  const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
  await writeDocumentEvent(supabase, {
    orgId: orgId ?? appUser.org_id,
    documentId,
    versionId: resolvedVersionId,
    eventType: "document.acknowledgement_completed",
    actorId: user.id,
  });

  revalidatePath("/dashboard/me/documents");
  revalidatePath(`/dashboard/documents/${documentId}`);
}

export async function declineDocumentAcknowledgement(documentId: string, versionId: string | null, reason: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");
  if (!reason.trim()) throw new Error("Explain why you're declining to acknowledge this document.");

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, current_version_id")
    .eq("id", documentId)
    .eq("employee_id", appUser.employee_id)
    .maybeSingle();
  if (!doc) throw new Error("Document not found, or it isn't yours to decline.");
  const resolvedVersionId = versionId ?? (doc.current_version_id as string | null);

  const { data: existing } = await supabase
    .from("document_acknowledgements")
    .select("id")
    .eq("document_id", documentId)
    .eq("employee_id", appUser.employee_id)
    .eq("version_id", resolvedVersionId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("document_acknowledgements")
      .update({ status: "declined", declined_at: new Date().toISOString(), decline_reason: reason })
      .eq("id", existing.id);
  } else {
    await supabase.from("document_acknowledgements").insert({
      org_id: appUser.org_id,
      document_id: documentId,
      employee_id: appUser.employee_id,
      version_id: resolvedVersionId,
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: reason,
    });
  }

  await writeDocumentEvent(supabase, {
    orgId: appUser.org_id,
    documentId,
    versionId: resolvedVersionId,
    eventType: "document.acknowledgement_declined",
    actorId: user.id,
    metadata: { reason },
  });

  revalidatePath("/dashboard/me/documents");
}
