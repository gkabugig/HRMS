"use server";

import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { revalidatePath } from "next/cache";


export async function createShiftPattern(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_patterns").insert({
    org_id: await requireOrgId(supabase),
    name: String(formData.get("name") || ""),
    start_time: String(formData.get("start_time") || ""),
    end_time: String(formData.get("end_time") || ""),
    grace_minutes: Number(formData.get("grace_minutes") || 15),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/shifts");
  });
}

export async function deleteShiftPattern(shiftPatternId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_patterns").delete().eq("id", shiftPatternId);
  if (error) {
    if (error.code === "23503") {
      throw new Error("Can't delete a shift that's still assigned to employees — reassign them first.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/shifts");
  });
}

export async function assignShift(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  const employeeId = String(formData.get("employee_id") || "");
  const shiftPatternId = String(formData.get("shift_pattern_id") || "");
  if (!employeeId || !shiftPatternId) throw new Error("Choose both an employee and a shift.");

  const { error } = await supabase
    .from("employee_shifts")
    .upsert({ employee_id: employeeId, shift_pattern_id: shiftPatternId, assigned_on: new Date().toISOString().slice(0, 10) });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/shifts");
  revalidatePath("/dashboard/attendance");
  });
}

export async function unassignShift(employeeId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_shifts").delete().eq("employee_id", employeeId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/shifts");
  revalidatePath("/dashboard/attendance");
  });
}
