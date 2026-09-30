"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

export async function uploadDocument(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { error: storageError } = await supabase.storage.from("employee-documents").remove([filePath]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("employee_documents").delete().eq("id", documentId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents");
  if (employeeId) revalidatePath(`/dashboard/employees/${employeeId}`);
}
