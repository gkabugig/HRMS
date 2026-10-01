"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireHrOrAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage document templates.");
  return { supabase, userId: user.id, orgId: appUser.org_id as string };
}

// Plain {{variable}} templates only (spec §22) — no template language with
// code-eval capability exists anywhere in this pipeline (see
// generation.ts's substituteTemplate, a single non-evaluating regex
// replace), so there is nothing here to sandbox beyond normal input length
// limits.
export async function createDocumentTemplate(formData: FormData): Promise<void> {
  const { supabase, userId, orgId } = await requireHrOrAdmin();

  const code = String(formData.get("code") || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const documentTypeId = String(formData.get("document_type_id") || "") || null;
  if (!code || !name || !body) throw new Error("Code, name, and body are required.");
  if (body.length > 20000) throw new Error("Template body is too long (max 20,000 characters).");

  const { error } = await supabase.from("document_templates").insert({
    org_id: orgId,
    code,
    name,
    body,
    document_type_id: documentTypeId,
    created_by: userId,
  });
  if (error) throw new Error(error.code === "23505" ? "A template with this code already exists." : error.message);

  revalidatePath("/dashboard/documents/templates");
}

export async function updateDocumentTemplate(templateId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireHrOrAdmin();

  const name = String(formData.get("name") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!name || !body) throw new Error("Name and body are required.");
  if (body.length > 20000) throw new Error("Template body is too long (max 20,000 characters).");

  const { data: current } = await supabase.from("document_templates").select("version").eq("id", templateId).maybeSingle();

  const { error } = await supabase
    .from("document_templates")
    .update({
      name,
      body,
      document_type_id: String(formData.get("document_type_id") || "") || null,
      is_active: formData.get("is_active") === "on",
      version: (current?.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents/templates");
}
