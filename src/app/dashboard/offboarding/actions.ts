"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const EXIT_TYPES = ["Resignation", "Termination", "Redundancy", "End of Contract", "Retirement"];

const DEFAULT_ASSET_CHECKLIST = ["Laptop", "ID card", "Access card", "Company phone"];

export async function initiateOffboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const exitType = String(formData.get("exit_type"));
  if (!EXIT_TYPES.includes(exitType)) throw new Error("Invalid exit type.");

  const { data: record, error } = await supabase
    .from("offboarding_records")
    .insert({
      employee_id: String(formData.get("employee_id")),
      exit_type: exitType,
      notice_date: String(formData.get("notice_date")),
      last_working_day: String(formData.get("last_working_day")),
      initiated_by: user!.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Seed a standard asset-return checklist so HR doesn't have to type it
  // out for every exit.
  await supabase.from("offboarding_assets").insert(
    DEFAULT_ASSET_CHECKLIST.map((item) => ({ offboarding_id: record.id, item }))
  );

  revalidatePath("/dashboard/offboarding");
  redirect(`/dashboard/offboarding/${record.id}`);
}

export async function addAsset(offboardingId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("offboarding_assets").insert({
    offboarding_id: offboardingId,
    item: String(formData.get("item")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
}

export async function toggleAssetReturned(assetId: string, offboardingId: string, returned: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("offboarding_assets")
    .update({ returned })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
}

export async function updateExitInterview(offboardingId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("offboarding_records")
    .update({
      exit_interview_completed: formData.get("exit_interview_completed") === "on",
      exit_interview_notes: String(formData.get("exit_interview_notes") || "") || null,
    })
    .eq("id", offboardingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
}

export async function updateFinalDues(offboardingId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("offboarding_records")
    .update({
      pro_rated_days: Number(formData.get("pro_rated_days") || 0),
      other_deductions: Number(formData.get("other_deductions") || 0),
      statutory_deregistered: formData.get("statutory_deregistered") === "on",
    })
    .eq("id", offboardingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
}

export async function completeOffboarding(offboardingId: string, employeeId: string) {
  const supabase = await createClient();

  const { error: recError } = await supabase
    .from("offboarding_records")
    .update({ status: "Completed", completed_on: new Date().toISOString() })
    .eq("id", offboardingId);
  if (recError) throw new Error(recError.message);

  const { error: empError } = await supabase
    .from("employees")
    .update({ status: "Terminated" })
    .eq("id", employeeId);
  if (empError) throw new Error(empError.message);

  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
  revalidatePath("/dashboard/offboarding");
  revalidatePath("/dashboard/employees");
}
