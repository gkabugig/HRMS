"use server";

import { revalidatePath } from "next/cache";
import { createDocument } from "./lifecycle";
import { generateDocumentFromTemplate } from "./generation";

// FormData-shaped wrappers around the Area 08 lifecycle/generation
// services, for direct use as <form action={...}> targets in the HR
// Document Centre — the services themselves take typed objects so they can
// also be called from JSON API routes / other server code without going
// through FormData parsing twice.
export async function uploadGovernedDocument(formData: FormData): Promise<void> {
  const employeeId = String(formData.get("employee_id") || "");
  const documentTypeId = String(formData.get("document_type_id") || "") || null;
  const docTypeLabel = String(formData.get("doc_type_label") || "Other");
  const title = String(formData.get("title") || "") || null;
  const visibility = String(formData.get("visibility") || "HR") as "HR" | "Manager" | "Employee";
  const sensitivity = String(formData.get("sensitivity") || "Confidential");
  const file = formData.get("file");
  if (!employeeId) throw new Error("Select an employee.");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");

  await createDocument({
    employeeId,
    documentTypeId,
    docTypeLabel,
    title,
    visibility,
    sensitivity,
    file,
    issueDate: String(formData.get("issue_date") || "") || null,
    expiryDate: String(formData.get("expiry_date") || "") || null,
    effectiveDate: String(formData.get("effective_date") || "") || null,
  });

  revalidatePath("/dashboard/documents");
}

export async function uploadNewVersion(documentId: string, employeeId: string, formData: FormData): Promise<void> {
  const { createClient } = await import("@/lib/supabase/server");
  const { createDocumentVersion } = await import("./versions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can add a new version.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  const notes = String(formData.get("notes") || "") || null;

  const { data: doc } = await supabase
    .from("employee_documents")
    .select("document_type_id")
    .eq("id", documentId)
    .maybeSingle();
  const { data: docType } = doc?.document_type_id
    ? await supabase.from("document_types").select("approval_required").eq("id", doc.document_type_id).maybeSingle()
    : { data: null };

  await createDocumentVersion(supabase, {
    orgId: appUser.org_id,
    documentId,
    employeeId,
    file,
    uploadedBy: user.id,
    status: docType?.approval_required ? "review" : "issued",
    notes,
  });

  if (docType?.approval_required) {
    await supabase.from("employee_documents").update({ lifecycle_state: "review" }).eq("id", documentId);
  }

  revalidatePath(`/dashboard/documents/${documentId}`);
}

export async function generateFromTemplateAction(formData: FormData): Promise<void> {
  const templateId = String(formData.get("template_id") || "");
  const employeeId = String(formData.get("employee_id") || "");
  const title = String(formData.get("title") || "");
  if (!templateId || !employeeId || !title) throw new Error("Template, employee, and title are required.");

  const customVariables: Record<string, string> = {};
  for (const key of ["new_title", "new_department", "effective_date_label", "reason"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value) customVariables[key] = value;
  }

  await generateDocumentFromTemplate({
    templateId,
    employeeId,
    title,
    customVariables,
    issueDate: String(formData.get("issue_date") || "") || null,
    expiryDate: String(formData.get("expiry_date") || "") || null,
    effectiveDate: String(formData.get("effective_date") || "") || null,
  });

  revalidatePath("/dashboard/documents");
}
