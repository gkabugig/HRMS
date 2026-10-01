"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { calculateLeaveDays } from "@/lib/leave/calculate-leave-days";
import { getLeaveConflicts } from "@/lib/leave/get-leave-conflicts";
import type { LeaveConflict } from "@/lib/leave/leave-types";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { getHrAndManagerRecipients, getEmployeeUserId } from "@/lib/notifications/recipients";
import { logDomainEvent } from "@/lib/domain-events/log-event";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { startWorkflowRun, completeWorkflowRun, PRIORITY_WORKFLOW_KEYS } from "@/lib/workflows/start-workflow-run";

export async function checkLeaveConflicts(
  employeeId: string,
  leaveType: string,
  startDate: string,
  endDate: string
): Promise<{ conflicts: LeaveConflict[]; workingDays: number }> {
  const supabase = await createClient();
  const { data: appUser } = await supabase.auth.getUser();
  const { data: caller } = await supabase.from("app_users").select("org_id").eq("id", appUser.user!.id).maybeSingle();
  if (!caller || !startDate || !endDate) return { conflicts: [], workingDays: 0 };

  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("holiday_date")
    .eq("org_id", caller.org_id)
    .lte("holiday_date", endDate)
    .gte("holiday_date", startDate);

  const workingDays = calculateLeaveDays(startDate, endDate, new Set((holidays ?? []).map((h) => h.holiday_date)));
  const conflicts = await getLeaveConflicts(supabase, caller.org_id, { employeeId, leaveType, startDate, endDate });

  return { conflicts, workingDays };
}

export async function applyForLeave(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("org_id, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const start = String(formData.get("start_date"));
  const end = String(formData.get("end_date"));
  const leaveType = String(formData.get("leave_type"));

  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("holiday_date")
    .eq("org_id", appUser.org_id)
    .lte("holiday_date", end)
    .gte("holiday_date", start);

  const days = calculateLeaveDays(start, end, new Set((holidays ?? []).map((h) => h.holiday_date)));

  const { data: created, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: appUser.employee_id,
      leave_type: leaveType,
      start_date: start,
      end_date: end,
      days,
      reason: String(formData.get("reason") || "") || null,
    })
    .select("id, employees(name)")
    .single();
  if (error) throw new Error(error.message);

  const recipients = await getHrAndManagerRecipients(supabase, appUser.org_id, appUser.employee_id);
  const empName = (created.employees as unknown as { name: string } | null)?.name ?? "An employee";
  await createNotificationForMany(supabase, recipients, {
    orgId: appUser.org_id,
    type: "LEAVE_APPROVAL_REQUIRED",
    category: "leave",
    priority: "action_required",
    title: "Leave request awaiting approval",
    message: `${empName} requested ${days} day(s) of ${leaveType} leave (${start} → ${end}).`,
    entityType: "leave_request",
    entityId: created.id,
    actionUrl: "/dashboard/leave?view=requests",
  });
  await logDomainEvent(supabase, {
    orgId: appUser.org_id,
    eventType: "LEAVE_REQUESTED",
    entityType: "leave_request",
    entityId: created.id,
    actorId: user!.id,
    payload: { leaveType, start, end, days },
  });
  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user!.id,
    action: "leave.requested",
    resourceType: "leave_request",
    resourceId: created.id,
    eventCategory: "workflow",
    after: { leaveType, start, end, days },
  });
  await startWorkflowRun(supabase, {
    orgId: appUser.org_id,
    key: PRIORITY_WORKFLOW_KEYS.LEAVE_APPROVAL,
    entityType: "leave_request",
    entityId: created.id,
  });

  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/me/leave");
  revalidatePath("/dashboard/me");
}

export async function decideLeave(id: string, decision: "Approved" | "Rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user!.id).maybeSingle();

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({ status: decision, approved_by: user!.id, decided_on: new Date().toISOString() })
    .eq("id", id)
    .select("id, employee_id, leave_type, start_date, end_date, days")
    .single();
  if (error) throw new Error(error.message);

  if (appUser) {
    const employeeUserId = await getEmployeeUserId(supabase, updated.employee_id);
    if (employeeUserId) {
      await createNotification(supabase, {
        orgId: appUser.org_id,
        recipientUserId: employeeUserId,
        type: `LEAVE_${decision.toUpperCase()}`,
        category: "leave",
        priority: "information",
        title: `Leave request ${decision.toLowerCase()}`,
        message: `Your ${updated.leave_type} leave request (${updated.start_date} → ${updated.end_date}) was ${decision.toLowerCase()}.`,
        entityType: "leave_request",
        entityId: updated.id,
        actionUrl: "/dashboard/leave",
      });
    }
    await logDomainEvent(supabase, {
      orgId: appUser.org_id,
      eventType: decision === "Approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      entityType: "leave_request",
      entityId: updated.id,
      actorId: user!.id,
    });
    await recordAuditEvent(supabase, {
      orgId: appUser.org_id,
      actorUserId: user!.id,
      action: decision === "Approved" ? "leave.approved" : "leave.rejected",
      resourceType: "leave_request",
      resourceId: updated.id,
      eventCategory: "approval",
      after: { status: decision },
    });

    const { data: run } = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("entity_type", "leave_request")
      .eq("entity_id", updated.id)
      .eq("status", "running")
      .maybeSingle();
    if (run) {
      await completeWorkflowRun(supabase, run.id, decision === "Approved" ? "completed" : "failed");
    }
  }

  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/me/leave");
  revalidatePath("/dashboard/me");
}

export async function cancelLeaveRequest(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("employee_id").eq("id", user!.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const { error } = await supabase
    .from("leave_requests")
    .delete()
    .eq("id", id)
    .eq("employee_id", appUser.employee_id)
    .eq("status", "Pending");
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/leave");
  revalidatePath("/dashboard/me/leave");
}
