"use server";

// Shared signed-URL helper (spec §9/§14: "private storage + signed,
// time-limited URLs", "check sensitivity and authorization on every
// view/download"). Before this, the same `.storage.from("employee-documents")
// .createSignedUrl(path, 3600)` call was repeated ad hoc at three call sites
// (documents/page.tsx, disciplinary/page.tsx, get-employee-360.ts) — this is
// the one place Area 05's new pages call instead of repeating it a fourth
// time. The documentId is never trusted blindly: the select below runs
// through the caller's own RLS-scoped client, so a document the caller
// isn't authorized to see (self_read / manager_visible / hr_full) returns
// "not found" rather than a path to sign — exactly the IDOR protection spec
// §14 asks for, enforced by the database, not by this function's logic.
import { createClient } from "@/lib/supabase/server";
import { logDocumentAccess } from "./actions";

export async function getSignedDocumentUrl(documentId: string, action: "view" | "download" = "view"): Promise<string> {
  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("employee_documents")
    .select("file_path")
    .eq("id", documentId)
    .single();
  if (error || !doc) throw new Error("Document not found, or you don't have access to it.");

  const { data: signed, error: signError } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(doc.file_path, 3600);
  if (signError || !signed) throw new Error(signError?.message ?? "Could not generate a secure link.");

  await logDocumentAccess(documentId, action);
  return signed.signedUrl;
}

// Spec §9 "support acknowledgements" — document_acknowledgements (migration
// 0064). Idempotent: re-acknowledging an already-acknowledged document is a
// no-op (unique(document_id, employee_id) turns the second insert into a
// clean 23505 rather than a duplicate row or an error the UI has to hide).
export async function acknowledgeDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id")
    .eq("id", documentId)
    .eq("employee_id", appUser.employee_id)
    .maybeSingle();
  if (!doc) throw new Error("Document not found, or it isn't yours to acknowledge.");

  const { error } = await supabase.from("document_acknowledgements").insert({
    org_id: appUser.org_id,
    document_id: documentId,
    employee_id: appUser.employee_id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}
