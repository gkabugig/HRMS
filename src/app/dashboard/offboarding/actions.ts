"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calcSeverancePay } from "@/lib/compliance";

const EXIT_TYPES = ["Resignation", "Termination", "Redundancy", "End of Contract", "Retirement"];

const DEFAULT_ASSET_CHECKLIST = ["Laptop", "ID card", "Access card", "Company phone"];

const MINIMUM_NOTICE_DAYS = 28; // s.35(1)(c): monthly-paid staff, 28 days' written notice

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export async function initiateOffboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const exitType = String(formData.get("exit_type"));
  if (!EXIT_TYPES.includes(exitType)) throw new Error("Invalid exit type.");

  const employeeId = String(formData.get("employee_id"));
  const noticeDate = String(formData.get("notice_date"));
  const lastWorkingDay = String(formData.get("last_working_day"));
  const paidInLieu = formData.get("paid_in_lieu_of_notice") === "on";

  const { data: employee, error: empErr } = await supabase
    .from("employees")
    .select("basic, date_of_hire, employment_type")
    .eq("id", employeeId)
    .single();
  if (empErr) throw new Error(empErr.message);

  // s.35(1)(c): 28 days' written notice for monthly-paid staff, unless paid
  // in lieu. Casuals are daily-paid (s.35(1)(a)) so this check doesn't apply
  // to them.
  if (employee.employment_type !== "Casual" && !paidInLieu) {
    const noticeDays = daysBetween(noticeDate, lastWorkingDay);
    if (noticeDays < MINIMUM_NOTICE_DAYS) {
      throw new Error(
        `Only ${noticeDays} days' notice given — the Employment Act requires ${MINIMUM_NOTICE_DAYS} days for monthly-paid staff. Extend the last working day, or tick "paid in lieu of notice".`
      );
    }
  }

  const severancePay =
    exitType === "Redundancy" ? calcSeverancePay(employee.basic, employee.date_of_hire, lastWorkingDay) : 0;

  const { data: record, error } = await supabase
    .from("offboarding_records")
    .insert({
      employee_id: employeeId,
      exit_type: exitType,
      notice_date: noticeDate,
      last_working_day: lastWorkingDay,
      paid_in_lieu_of_notice: paidInLieu,
      severance_pay: severancePay,
      labour_office_notified_on: String(formData.get("labour_office_notified_on") || "") || null,
      union_notified_on: String(formData.get("union_notified_on") || "") || null,
      selection_criteria: String(formData.get("selection_criteria") || "") || null,
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
      severance_pay: Number(formData.get("severance_pay") || 0),
    })
    .eq("id", offboardingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/offboarding/${offboardingId}`);
}

export async function updateRedundancyRecords(offboardingId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("offboarding_records")
    .update({
      labour_office_notified_on: String(formData.get("labour_office_notified_on") || "") || null,
      union_notified_on: String(formData.get("union_notified_on") || "") || null,
      selection_criteria: String(formData.get("selection_criteria") || "") || null,
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
