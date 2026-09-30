"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ACTION_TYPES = ["Verbal warning", "Written warning", "Suspension", "Termination", "No action"];

// Employment Act s.41: before terminating for misconduct, poor performance, or
// incapacity, the employer must explain the reason in a language the
// employee understands and hear their response (with a representative
// present if they choose). This is the record that proves that happened.
export async function recordHearing(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const actionType = String(formData.get("action_type") || "Written warning");
  if (!ACTION_TYPES.includes(actionType)) throw new Error("Invalid action type.");

  const { error } = await supabase.from("disciplinary_actions").insert({
    employee_id: String(formData.get("employee_id")),
    reason: String(formData.get("reason")),
    hearing_date: String(formData.get("hearing_date")),
    representative_present: formData.get("representative_present") === "on",
    representative_name: String(formData.get("representative_name") || "") || null,
    employee_response: String(formData.get("employee_response") || "") || null,
    outcome: String(formData.get("outcome") || "") || null,
    action_type: actionType,
    created_by: user!.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/disciplinary");
}

// Warning letters, employee written responses, signed acknowledgements etc.
// Stored in a private bucket, path-prefixed by employee_id so storage RLS
// can scope access the same way the table policies above do.
export async function addAttachment(
  disciplinaryActionId: string,
  employeeId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to attach.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${employeeId}/${disciplinaryActionId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("disciplinary-documents")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("disciplinary_attachments").insert({
    disciplinary_action_id: disciplinaryActionId,
    employee_id: employeeId,
    file_path: path,
    file_name: file.name,
    uploaded_by: user!.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/disciplinary");
}

// HR/admin only in practice — RLS on disciplinary_attachments only grants
// delete via the "for all" HR/admin policy.
export async function deleteAttachment(attachmentId: string, filePath: string) {
  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("disciplinary-documents")
    .remove([filePath]);
  if (storageError) throw new Error(storageError.message);

  const { error } = await supabase.from("disciplinary_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/disciplinary");
}
