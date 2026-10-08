"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { requireEmployeeCtx, str, notify, type Db } from "./context";
import { inWeek, isIsoDate, sumHours, weekStartOf } from "./week";

async function ensureTimesheet(c: Awaited<ReturnType<typeof requireEmployeeCtx>>, weekStart: string) {
  const { data: existing } = await c.supabase.from("timesheets").select("id, status").eq("employee_id", c.employeeId).eq("week_start", weekStart).maybeSingle();
  if (existing) return existing as { id: string; status: string };
  const { data, error } = await c.supabase.from("timesheets").insert({ org_id: c.orgId, employee_id: c.employeeId, week_start: weekStart }).select("id, status").single();
  if (error) throw new Error(error.message);
  return data as { id: string; status: string };
}

export async function addTimesheetEntry(weekStart: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    if (!isIsoDate(weekStart) || weekStartOf(weekStart) !== weekStart) throw new Error("That week is not valid.");
    const date = str(formData.get("work_date"));
    const hours = Number(str(formData.get("hours")));
    if (!isIsoDate(date) || !inWeek(weekStart, date)) throw new Error("Pick a day inside this week.");
    if (date > nairobiNow().date) throw new Error("You can't log hours for a day that hasn't happened yet.");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error("Hours must be more than 0 and no more than 24.");
    const ts = await ensureTimesheet(c, weekStart);
    if (!["Draft", "Rejected"].includes(ts.status)) throw new Error("This week has already been sent. Ask your manager to send it back if it needs changing.");
    // One day cannot hold more than 24 hours in total.
    const { data: sameDay } = await c.supabase.from("timesheet_entries").select("hours").eq("timesheet_id", ts.id).eq("work_date", date);
    if (sumHours([...(sameDay ?? []).map((e) => Number(e.hours)), hours]) > 24) throw new Error("That would make more than 24 hours for the day.");
    const { error } = await c.supabase.from("timesheet_entries").insert({ timesheet_id: ts.id, work_date: date, hours, project: str(formData.get("project")) || null, note: str(formData.get("note")) || null });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/timesheets");
  });
}

export async function deleteTimesheetEntry(entryId: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const { error } = await c.supabase.from("timesheet_entries").delete().eq("id", entryId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/me/timesheets");
  });
}

export async function submitTimesheet(weekStart: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireEmployeeCtx();
    const { data: ts } = await c.supabase.from("timesheets").select("id, status").eq("employee_id", c.employeeId).eq("week_start", weekStart).maybeSingle();
    if (!ts) throw new Error("There are no hours logged for this week.");
    if (!["Draft", "Rejected"].includes(ts.status as string)) throw new Error("This week has already been sent.");
    const { data: entries } = await c.supabase.from("timesheet_entries").select("hours").eq("timesheet_id", ts.id);
    const total = sumHours((entries ?? []).map((e) => Number(e.hours)));
    if (total <= 0) throw new Error("Log some hours before you send the week.");

    const db = createAdminClient() as Db;
    const { data: emp } = await db.from("employees").select("name, reporting_manager_id").eq("id", c.employeeId).maybeSingle();
    let steps: { approverUserId?: string; approverRole?: string }[] = [{ approverRole: c.role === "hr" ? "admin" : "hr" }];
    if (emp?.reporting_manager_id) {
      const { data: mgr } = await db.from("app_users").select("id").eq("employee_id", emp.reporting_manager_id).maybeSingle();
      if (mgr?.id && mgr.id !== c.userId) steps = [{ approverUserId: mgr.id as string }];
    }
    const requestId = await createApprovalRequest(db, {
      orgId: c.orgId,
      requestType: "timesheet",
      entityType: "timesheet",
      entityId: ts.id as string,
      requestedBy: c.userId,
      subjectEmployeeId: c.employeeId,
      summary: `Timesheet for ${emp?.name ?? "employee"}: week of ${weekStart}, ${total} hours`,
      impact: { weekStart, hours: total },
      steps,
    });
    await db.from("timesheets").update({ status: "Submitted", total_hours: total, submitted_at: new Date().toISOString(), approval_request_id: requestId, decided_at: null }).eq("id", ts.id);
    revalidatePath("/dashboard/me/timesheets");
    revalidatePath("/dashboard/approvals");
  });
}

// Called from the approvals inbox.
export async function decideTimesheetApproval(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");
  const { data: stepRow } = await supabase.from("approval_steps").select("approval_requests(entity_id, subject_employee_id)").eq("id", stepId).maybeSingle();
  const req = stepRow?.approval_requests as unknown as { entity_id: string | null; subject_employee_id: string | null } | null;
  if (!req?.entity_id) throw new Error("Timesheet not found.");
  if (appUser.employee_id && req.subject_employee_id === appUser.employee_id) throw new Error("You cannot approve your own timesheet.");

  const { requestStatus } = await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });
  if (decision === "approved" && requestStatus !== "approved") {
    revalidatePath("/dashboard/approvals");
    return;
  }
  const db = createAdminClient() as Db;
  const status = decision === "approved" ? "Approved" : "Rejected";
  await db.from("timesheets").update({ status, decided_at: new Date().toISOString() }).eq("id", req.entity_id).eq("org_id", appUser.org_id);
  if (req.subject_employee_id) {
    const { data: u } = await db.from("app_users").select("id").eq("employee_id", req.subject_employee_id).maybeSingle();
    await notify(db, { orgId: appUser.org_id, userIds: [(u?.id as string | undefined) ?? null], type: "TIMESHEET_DECIDED", title: decision === "approved" ? "Your timesheet was approved" : "Your timesheet was sent back", message: decision === "approved" ? "Your hours for the week are approved." : "Open it, correct the hours and send it again.", entityType: "timesheet", entityId: req.entity_id, actionUrl: "/dashboard/me/timesheets" });
  }
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/me/timesheets");
  revalidatePath("/dashboard/timesheets");
}
