"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { getEmployeeUserId } from "@/lib/notifications/recipients";
import { createNotification } from "@/lib/notifications/create-notification";

// Document Management extensions (Phase 2 spec §6/§7) on top of the
// already-working employee_documents module (upload/delete stay in
// documents/actions.ts, untouched). This file adds: logging every
// signed-URL issuance, and the request-a-document flow (HR asks an
// employee to upload something specific, the employee fulfils it from
// their own Documents page).

export async function logDocumentAccess(documentId: string, action: "view" | "download") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("document_access_logs").insert({ document_id: documentId, accessed_by: user.id, action });
}

export async function requestDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can request a document.");

  const employeeId = String(formData.get("employee_id") || "");
  const docType = String(formData.get("doc_type") || "");
  const reason = String(formData.get("reason") || "");
  if (!employeeId || !docType || !reason) throw new Error("Employee, document type, and reason are required.");

  const { data: created, error } = await supabase
    .from("document_requests")
    .insert({
      org_id: appUser.org_id,
      employee_id: employeeId,
      doc_type: docType,
      reason,
      due_date: String(formData.get("due_date") || "") || null,
      requested_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    action: "document.requested",
    resourceType: "document_request",
    resourceId: created.id,
    eventCategory: "workflow",
    after: { employeeId, docType, reason },
  });

  const employeeUserId = await getEmployeeUserId(supabase, employeeId);
  if (employeeUserId) {
    await createNotification(supabase, {
      orgId: appUser.org_id,
      recipientUserId: employeeUserId,
      type: "DOCUMENT_REQUESTED",
      category: "documents",
      priority: "action_required",
      title: "Document requested",
      message: `HR requested: ${docType} — ${reason}`,
      entityType: "document_request",
      entityId: created.id,
      actionUrl: "/dashboard/documents",
    });
  }

  revalidatePath("/dashboard/documents");
}

// Employee fulfils an open request by uploading straight to it — reuses
// the same private bucket/table as every other document, just also links
// the new row back to the request and closes it out.
export async function fulfilDocumentRequest(requestId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: request } = await supabase
    .from("document_requests")
    .select("id, employee_id, doc_type")
    .eq("id", requestId)
    .single();
  if (!request) throw new Error("Request not found.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${request.employee_id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("employee-documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data: doc, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: request.employee_id,
      doc_type: request.doc_type,
      file_path: path,
      file_name: file.name,
      uploaded_by: user.id,
      visibility: "HR",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("document_requests")
    .update({ status: "Fulfilled", fulfilled_document_id: doc.id, fulfilled_at: new Date().toISOString() })
    .eq("id", requestId);

  revalidatePath("/dashboard/documents");
}
