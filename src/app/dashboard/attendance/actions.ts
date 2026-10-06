"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { correctAttendance } from "@/lib/attendance/correct-attendance";
import { createNotificationForMany } from "@/lib/notifications/create-notification";
import { logDomainEvent } from "@/lib/domain-events/log-event";

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

  // Typing in clock times is an HR/admin tool. Employees clock in through My
  // Attendance, where the time and location are checked on the server.
  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    throw new Error("Only HR or an admin can record attendance times by hand. Use Clock in on My Attendance.");
  }
  const employeeId = String(formData.get("employee_id") || "");
  if (!employeeId) throw new Error("No employee selected.");

  const payload = {
    employee_id: employeeId,
    work_date: String(formData.get("work_date")),
    clock_in: String(formData.get("clock_in") || "") || null,
    clock_out: String(formData.get("clock_out") || "") || null,
    source: "manual",
  };

  const { error } = await supabase
    .from("attendance")
    .upsert(payload, { onConflict: "employee_id,work_date" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/attendance");
}

export async function submitAttendanceCorrection(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user!.id).maybeSingle();
  if (!appUser) throw new Error("Not signed in.");

  const employeeId = String(formData.get("employee_id"));
  const workDate = String(formData.get("work_date"));
  const field = String(formData.get("field")) as "clock_in" | "clock_out";
  const correctedValue = String(formData.get("corrected_value"));
  const reason = String(formData.get("reason") || "");
  if (!reason.trim()) throw new Error("A reason is required for every attendance correction.");

  const { payrollImpact } = await correctAttendance(supabase, {
    orgId: appUser.org_id,
    employeeId,
    workDate,
    field,
    correctedValue,
    reason,
    actorId: user!.id,
  });

  await logDomainEvent(supabase, {
    orgId: appUser.org_id,
    eventType: "ATTENDANCE_CORRECTED",
    entityType: "attendance",
    entityId: employeeId,
    actorId: user!.id,
    payload: { workDate, field, correctedValue, payrollImpact },
  });

  if (payrollImpact) {
    const { data: hrUsers } = await supabase.from("app_users").select("id").eq("org_id", appUser.org_id).in("role", ["admin", "hr"]);
    const { data: employee } = await supabase.from("employees").select("name").eq("id", employeeId).maybeSingle();
    await createNotificationForMany(
      supabase,
      (hrUsers ?? []).map((u) => u.id),
      {
        orgId: appUser.org_id,
        type: "ATTENDANCE_CORRECTION_PAYROLL_IMPACT",
        category: "payroll",
        priority: "action_required",
        title: "Attendance correction may affect payroll",
        message: `${employee?.name ?? "An employee"}'s ${workDate} attendance was corrected after payroll moved past inputs — review before finalising.`,
        entityType: "employee",
        entityId: employeeId,
        actionUrl: `/dashboard/employees/${employeeId}?tab=payroll`,
      }
    );
  }

  revalidatePath("/dashboard/attendance");
}
