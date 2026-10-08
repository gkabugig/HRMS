"use server";

// Lunch and tea breaks against today's clock-in. The person comes from the
// session; times are set here, not by the browser. Written with the service
// client because there is deliberately no employee write policy on breaks.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeCtx, str, type Db } from "@/lib/hub/context";
import { nairobiNow } from "./nairobi-time";

export async function startBreak(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const kind = ["lunch", "tea", "other"].includes(str(formData.get("kind"))) ? str(formData.get("kind")) : "lunch";
    const db = createAdminClient() as Db;
    const today = nairobiNow().date;
    const { data: att } = await db.from("attendance").select("clock_in, clock_out").eq("employee_id", c.employeeId).eq("work_date", today).maybeSingle();
    if (!att?.clock_in) throw new Error("Clock in before you start a break.");
    if (att.clock_out) throw new Error("You have already clocked out for today.");
    const { data: open } = await db.from("attendance_breaks").select("id").eq("employee_id", c.employeeId).is("ended_at", null).maybeSingle();
    if (open) throw new Error("You are already on a break. Resume your shift first.");
    const { error } = await db.from("attendance_breaks").insert({ org_id: c.orgId, employee_id: c.employeeId, work_date: today, kind });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/attendance");
  });
}

export async function endBreak(_prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const db = createAdminClient() as Db;
    const { data: open } = await db.from("attendance_breaks").select("id").eq("employee_id", c.employeeId).is("ended_at", null).maybeSingle();
    if (!open) throw new Error("You are not on a break.");
    const { error } = await db.from("attendance_breaks").update({ ended_at: new Date().toISOString() }).eq("id", open.id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/attendance");
  });
}
