"use server";

// Area 05 §9/§18 "Upload only into approved categories" — the employee
// self-upload path (now that migration 0066 actually grants it at the RLS
// layer). Deliberately separate from src/app/dashboard/documents/actions.ts's
// uploadDocument(), which is an HR/admin "upload on an employee's behalf"
// action gated by a coarse organisation-wide RBAC check — this one is for
// the employee uploading their OWN document (a payslip query attachment, a
// bank letter as profile-change evidence, a certificate for a document
// request), so it's scoped to employee_id = the caller's own, not RBAC'd at
// all beyond that (matching the self-insert RLS policy's own boundary).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const SELF_SERVICE_DOC_TYPES = ["ID Copy", "Bank Letter", "Certificate", "Evidence", "Other"] as const;

export async function uploadMyDocument(formData: FormData): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");

  const docType = String(formData.get("doc_type") || "Other");
  if (!SELF_SERVICE_DOC_TYPES.includes(docType as (typeof SELF_SERVICE_DOC_TYPES)[number])) {
    throw new Error("Invalid document type.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${appUser.employee_id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("employee-documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data: doc, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: appUser.employee_id,
      doc_type: docType,
      file_path: path,
      file_name: file.name,
      uploaded_by: user.id,
      visibility: "Employee",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/me/documents");
  return { id: doc.id };
}
