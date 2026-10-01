"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/authz/authorize";

const DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

export async function uploadDocument(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Documents is one of the three resources Universal RBAC enforces
  // explicitly. Record-level scoping (self/direct_reports) is meaningful
  // for *reading* someone's documents, but uploading on their behalf is an
  // organisation-wide HR/admin action today (matches the inline check in
  // the employee_documents_insert_rbac RLS policy), so this is a coarse
  // check rather than a record-level one against `employeeId`.
  const decision = await authorize(supabase, {
    resource: "documents",
    action: "edit",
    sensitivity: "confidential",
  });
  if (!decision.allowed) throw new Error("You do not have permission to upload documents for employees.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }
  const docType = String(formData.get("doc_type") || "Other");
  if (!DOC_TYPES.includes(docType)) throw new Error("Invalid document type.");
  const visibility = String(formData.get("visibility") || "HR");
  if (!["HR", "Manager", "Employee"].includes(visibility)) throw new Error("Invalid visibility.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${employeeId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("employee-documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("employee_documents").insert({
    employee_id: employeeId,
    doc_type: docType,
    file_path: path,
    file_name: file.name,
    uploaded_by: user!.id,
    issue_date: String(formData.get("issue_date") || "") || null,
    expiry_date: String(formData.get("expiry_date") || "") || null,
    visibility,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
  revalidatePath(`/dashboard/employees/${employeeId}`);
}

export async function deleteDocument(documentId: string, filePath: string, employeeId?: string) {
  const supabase = await createClient();

  // Record-level check: resolves the document's owning employee and scope
  // (self/direct_reports/organisation) via authorize_request's documents
  // dispatch, independent of the employeeId the caller happens to pass in.
  const decision = await authorize(supabase, {
    resource: "documents",
    action: "edit",
    sensitivity: "confidential",
    recordId: documentId,
  });
  if (!decision.allowed) throw new Error("You do not have permission to delete this document.");

  const { error: storageError } = await supabase.storage.from("employee-documents").remove([filePath]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("employee_documents").delete().eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
  if (employeeId) revalidatePath(`/dashboard/employees/${employeeId}`);
}
