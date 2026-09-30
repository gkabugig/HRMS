"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function recordAttendance(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const employeeId =
    appUser?.role === "employee" ? appUser.employee_id : String(formData.get("employee_id"));
  if (!employeeId) throw new Error("No employee selected.");

  const payload = {
    employee_id: employeeId,
    work_date: String(formData.get("work_date")),
    clock_in: String(formData.get("clock_in") || "") || null,
    clock_out: String(formData.get("clock_out") || "") || null,
    source: appUser?.role === "employee" ? "mobile" : "manual",
  };

  const { error } = await supabase
    .from("attendance")
    .upsert(payload, { onConflict: "employee_id,work_date" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/attendance");
}
