"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validatePhoto, buildPhotoStoragePath } from "@/lib/employees/photo";

const ASSET_STATUSES = ["Assigned", "Returned", "Lost", "Damaged"] as const;
const NOTE_VISIBILITIES = ["HR", "Manager"] as const;

function revalidateProfile(employeeId: string) {
  revalidatePath(`/dashboard/employees/${employeeId}`);
}

export async function addNote(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const note = String(formData.get("note") || "").trim();
  if (!note) throw new Error("Note text is required.");
  const visibility = String(formData.get("visibility") || "HR");
  if (!NOTE_VISIBILITIES.includes(visibility as (typeof NOTE_VISIBILITIES)[number])) {
    throw new Error("Invalid visibility.");
  }

  const { error } = await supabase.from("employee_notes").insert({
    employee_id: employeeId,
    note_type: String(formData.get("note_type") || "General"),
    note,
    visibility,
    created_by: user!.id,
  });
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}

export async function addContact(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Contact name is required.");

  const { error } = await supabase.from("employee_contacts").insert({
    employee_id: employeeId,
    contact_type: String(formData.get("contact_type") || "Emergency"),
    name,
    relationship: String(formData.get("relationship") || "") || null,
    phone: String(formData.get("phone") || "") || null,
    email: String(formData.get("email") || "") || null,
    address: String(formData.get("address") || "") || null,
    is_primary: formData.get("is_primary") === "on",
  });
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}

export async function deleteContact(contactId: string, employeeId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_contacts").delete().eq("id", contactId);
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}

// Authorization for who may set a photo is enforced by storage.objects RLS
// (employee_photos_hr_write / employee_photos_self_write, migration 0121) -
// HR/admin for any employee, or an employee for their own photo - the same
// self-or-hr shape as employees_self_update on the employees table itself.
// A re-upload overwrites the previous file (fixed path, upsert:true) rather
// than accumulating old photos.
export async function uploadEmployeePhoto(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("photo");
  if (!(file instanceof File)) throw new Error("Choose a photo to upload.");

  const validation = validatePhoto(file);
  if (!validation.ok) throw new Error(validation.error);

  const path = buildPhotoStoragePath(employeeId, validation.extension);
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("employee-photos")
    .upload(path, bytes, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase.from("employees").update({ photo_path: path }).eq("id", employeeId);
  if (updateError) throw new Error(updateError.message);

  revalidateProfile(employeeId);
}

export async function removeEmployeePhoto(employeeId: string, photoPath: string) {
  const supabase = await createClient();
  // Best-effort delete of the stored file; even if this fails (e.g. the
  // file is already gone), still clear photo_path so the UI falls back to
  // the initials avatar rather than a broken image.
  await supabase.storage.from("employee-photos").remove([photoPath]);

  const { error } = await supabase.from("employees").update({ photo_path: null }).eq("id", employeeId);
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}

export async function addAsset(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const assetType = String(formData.get("asset_type") || "").trim();
  if (!assetType) throw new Error("Asset type is required.");

  const { error } = await supabase.from("employee_assets").insert({
    employee_id: employeeId,
    asset_type: assetType,
    asset_tag: String(formData.get("asset_tag") || "") || null,
    serial_no: String(formData.get("serial_no") || "") || null,
    issued_on: String(formData.get("issued_on") || "") || new Date().toISOString().slice(0, 10),
    condition: String(formData.get("condition") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}

export async function updateAssetStatus(assetId: string, employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const status = String(formData.get("status") || "");
  if (!ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
    throw new Error("Invalid asset status.");
  }
  const { error } = await supabase
    .from("employee_assets")
    .update({
      status,
      returned_on: status === "Returned" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
  revalidateProfile(employeeId);
}
