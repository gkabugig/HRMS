"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { getCtx, requireEmployeeCtx, requireHrCtx, str, notify, type Db } from "./context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIsoDate, weekStartOf } from "./week";

const todayKe = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

export async function submitCheckin(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const mood = Number(str(formData.get("mood")));
    if (!Number.isInteger(mood) || mood < 1 || mood > 5) throw new Error("Choose how you are feeling.");
    const note = str(formData.get("note"));
    const { error } = await c.supabase
      .from("wellbeing_checkins")
      .upsert({ org_id: c.orgId, employee_id: c.employeeId, week_start: weekStartOf(todayKe()), mood, note: note || null }, { onConflict: "employee_id,week_start" });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/wellbeing");
  });
}

export async function addResource(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const title = str(formData.get("title"));
    const url = str(formData.get("url"));
    if (!title) throw new Error("Give the resource a title.");
    if (url && !/^https?:\/\//i.test(url)) throw new Error("The link must start with http:// or https://");
    const { error } = await c.supabase.from("wellbeing_resources").insert({ org_id: c.orgId, title, body: str(formData.get("body")) || null, url: url || null });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/wellbeing");
    revalidatePath("/dashboard/me/wellbeing");
  });
}

export async function deleteResource(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("wellbeing_resources").delete().eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/wellbeing");
    revalidatePath("/dashboard/me/wellbeing");
  });
}

export async function addChecklistItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const title = str(formData.get("title"));
    const due = str(formData.get("due_date"));
    if (!title) throw new Error("Write the task.");
    if (due && !isIsoDate(due)) throw new Error("The due date is not valid.");
    const { error } = await c.supabase.from("checklist_items").insert({ org_id: c.orgId, employee_id: c.employeeId, title, due_date: due || null });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/tasks");
    revalidatePath("/dashboard/me");
  });
}

export async function toggleChecklistItem(id: string, done: boolean, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await getCtx();
    if (!c.employeeId) throw new Error("Your login isn't linked to an employee record.");
    const { error } = await c.supabase.from("checklist_items").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id).eq("employee_id", c.employeeId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/tasks");
    revalidatePath("/dashboard/me");
  });
}

export async function deleteChecklistItem(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await getCtx();
    if (!c.employeeId) throw new Error("Your login isn't linked to an employee record.");
    // Tasks HR assigned can only be removed by HR; the person can tick them off.
    const { error } = await c.supabase.from("checklist_items").delete().eq("id", id).eq("employee_id", c.employeeId).is("assigned_by", null);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/tasks");
  });
}

// HR hands a task to one person, or to everyone (e.g. "Complete your tax PIN update").
export async function assignChecklistItem(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const title = str(formData.get("title"));
    const due = str(formData.get("due_date"));
    const target = str(formData.get("employee_id"));
    if (!title) throw new Error("Write the task.");
    if (due && !isIsoDate(due)) throw new Error("The due date is not valid.");
    let q = c.supabase.from("employees").select("id").eq("org_id", c.orgId).eq("status", "Active");
    if (target && target !== "all") q = q.eq("id", target);
    const { data: emps, error: e1 } = await q.limit(2000);
    if (e1) throw new Error(e1.message);
    if (!emps?.length) throw new Error("No one to assign this to.");
    const { error } = await c.supabase.from("checklist_items").insert(emps.map((e) => ({ org_id: c.orgId, employee_id: e.id as string, title, due_date: due || null, assigned_by: c.userId })));
    if (error) throw new Error(error.message);
    const db = createAdminClient() as Db;
    const { data: users } = await db.from("app_users").select("id").eq("org_id", c.orgId).in("employee_id", emps.map((e) => e.id as string));
    await notify(db, { orgId: c.orgId, userIds: (users ?? []).map((u) => u.id as string), type: "CHECKLIST_ASSIGNED", title: "New task for you", message: title, entityType: "checklist", entityId: c.orgId, actionUrl: "/dashboard/me/tasks" });
    revalidatePath("/dashboard/me/tasks");
  });
}
