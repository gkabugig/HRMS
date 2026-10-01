"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { DOCUMENT_SENSITIVITIES } from "./types";

async function requireHrOrAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage document types.");
  return { supabase, userId: user.id, orgId: appUser.org_id as string };
}

export async function createDocumentType(formData: FormData): Promise<void> {
  const { supabase, userId, orgId } = await requireHrOrAdmin();

  const code = String(formData.get("code") || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const name = String(formData.get("name") || "").trim();
  const defaultSensitivity = String(formData.get("default_sensitivity") || "Confidential");
  if (!code || !name) throw new Error("Code and name are required.");
  if (!DOCUMENT_SENSITIVITIES.includes(defaultSensitivity as never)) throw new Error("Invalid sensitivity.");

  const schedule = String(formData.get("expiry_warning_days_schedule") || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const { error } = await supabase.from("document_types").insert({
    org_id: orgId,
    code,
    name,
    description: String(formData.get("description") || "") || null,
    default_sensitivity: defaultSensitivity,
    requires_acknowledgement: formData.get("requires_acknowledgement") === "on",
    acknowledgement_reset_on_new_version: formData.get("acknowledgement_reset_on_new_version") === "on",
    approval_required: formData.get("approval_required") === "on",
    expiry_warning_days_schedule: schedule,
    retention_period_months: formData.get("retention_period_months") ? Number(formData.get("retention_period_months")) : null,
    created_by: userId,
  });
  if (error) throw new Error(error.code === "23505" ? "A document type with this code already exists." : error.message);

  revalidatePath("/dashboard/documents/types");
}

export async function updateDocumentType(typeId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireHrOrAdmin();

  const name = String(formData.get("name") || "").trim();
  const defaultSensitivity = String(formData.get("default_sensitivity") || "Confidential");
  if (!name) throw new Error("Name is required.");
  if (!DOCUMENT_SENSITIVITIES.includes(defaultSensitivity as never)) throw new Error("Invalid sensitivity.");

  const schedule = String(formData.get("expiry_warning_days_schedule") || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const { error } = await supabase
    .from("document_types")
    .update({
      name,
      description: String(formData.get("description") || "") || null,
      default_sensitivity: defaultSensitivity,
      requires_acknowledgement: formData.get("requires_acknowledgement") === "on",
      acknowledgement_reset_on_new_version: formData.get("acknowledgement_reset_on_new_version") === "on",
      approval_required: formData.get("approval_required") === "on",
      expiry_warning_days_schedule: schedule,
      retention_period_months: formData.get("retention_period_months") ? Number(formData.get("retention_period_months")) : null,
      is_active: formData.get("is_active") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", typeId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/documents/types");
  revalidatePath(`/dashboard/documents/types/${typeId}`);
}
