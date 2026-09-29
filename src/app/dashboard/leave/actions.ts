"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function businessDaysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return days;
}

export async function applyForLeave(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const start = String(formData.get("start_date"));
  const end = String(formData.get("end_date"));

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: appUser.employee_id,
    leave_type: String(formData.get("leave_type")),
    start_date: start,
    end_date: end,
    days: businessDaysBetween(start, end),
    reason: String(formData.get("reason") || "") || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leave");
}

export async function decideLeave(id: string, decision: "Approved" | "Rejected") {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision, approved_by: user!.id, decided_on: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leave");
}
