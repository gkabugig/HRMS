import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/authz/authorize";
import { writeDocumentEvent } from "./events";

// Area 08 §12 Secure Access. Every read of a document's bytes goes through
// here: authorize → short-lived signed URL (post-authorization, never a
// permanent public URL per spec §2) → audit. This is the one place that
// talks to the `employee-documents` bucket for reads, so every call site
// (HR Document Centre, Employee Portal, Manager Workspace, Employee 360,
// future AI search) gets the same enforcement — satisfying spec §23/§33's
// "must never bypass document permissions."
const SIGNED_URL_TTL_SECONDS = 300;

export async function getDocumentAccess(
  supabase: SupabaseClient,
  input: { documentId: string; versionId?: string | null; action?: "view" | "download" }
): Promise<{ url: string; fileName: string; versionId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: doc, error: docErr } = await supabase
    .from("employee_documents")
    .select("id, employee_id, org_id:employees!employee_id(org_id), current_version_id, file_path, file_name")
    .eq("id", input.documentId)
    .maybeSingle();
  if (docErr || !doc) throw new Error("Document not found, or you don't have access to it.");

  // RLS is the enforcement floor (employee_documents_select_rbac /
  // self_read / manager_visible / hr_full) — this authorize() call exists
  // to give a clear denial message and to make the server-side check
  // explicit in code, not to replace the database layer (spec §2: "enforce
  // authorization server-side AND with RLS — UI hiding is not security").
  const decision = await authorize(supabase, {
    resource: "documents",
    action: "view",
    sensitivity: "confidential",
    recordId: doc.employee_id,
  });
  const orgRow = doc.org_id as unknown as { org_id: string } | null;
  const isSelf = doc.employee_id === (await currentEmployeeId(supabase));
  if (!decision.allowed && !isSelf) {
    throw new Error("You do not have permission to access this document.");
  }

  let filePath = doc.file_path as string;
  let fileName = doc.file_name as string;
  let versionId = doc.current_version_id as string | null;

  if (input.versionId) {
    const { data: version, error: versionErr } = await supabase
      .from("document_versions")
      .select("id, file_path, file_name, document_id")
      .eq("id", input.versionId)
      .maybeSingle();
    if (versionErr || !version || version.document_id !== doc.id) {
      throw new Error("Document version not found.");
    }
    filePath = version.file_path as string;
    fileName = version.file_name as string;
    versionId = version.id as string;
  } else if (versionId) {
    const { data: version } = await supabase
      .from("document_versions")
      .select("file_path, file_name")
      .eq("id", versionId)
      .maybeSingle();
    if (version) {
      filePath = version.file_path as string;
      fileName = version.file_name as string;
    }
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("employee-documents")
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) throw new Error(signError?.message ?? "Could not generate a secure link.");

  const action = input.action ?? "view";
  await supabase.from("document_access_logs").insert({ document_id: doc.id, accessed_by: user.id, action });
  await writeDocumentEvent(supabase, {
    orgId: orgRow?.org_id ?? "",
    documentId: doc.id as string,
    versionId,
    eventType: action === "download" ? "document.downloaded" : "document.viewed",
    actorId: user.id,
    metadata: { fileName },
  });

  return { url: signed.signedUrl, fileName, versionId: versionId ?? "" };
}

async function currentEmployeeId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("app_users").select("employee_id").eq("id", user.id).maybeSingle();
  return data?.employee_id ?? null;
}
