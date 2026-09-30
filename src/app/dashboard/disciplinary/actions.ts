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
