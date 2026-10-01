"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { getHrAndManagerRecipients, getEmployeeUserId } from "@/lib/notifications/recipients";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { processEventImmediately } from "@/lib/notifications/scheduler";

// HR Service Requests / Service Centre (Phase 2 spec §9). A lightweight
// ticketing flow on top of the seeded service_catalogue — not a full
// helpdesk, just enough to raise, track, discuss, and close a request with
// an auditable status trail (service_request_status_history).

export async function submitServiceRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const catalogueId = String(formData.get("catalogue_id") || "") || null;
  const subject = String(formData.get("subject") || "");
  const description = String(formData.get("description") || "");
  const priority = String(formData.get("priority") || "normal");
  if (!subject || !description) throw new Error("Subject and description are required.");

  let slaDueAt: string | null = null;
  if (catalogueId) {
    const { data: cat } = await supabase.from("service_catalogue").select("default_sla_hours").eq("id", catalogueId).maybeSingle();
    if (cat) slaDueAt = new Date(Date.now() + cat.default_sla_hours * 3600 * 1000).toISOString();
  }

  const { data: created, error } = await supabase
    .from("service_requests")
    .insert({
      org_id: appUser.org_id,
      catalogue_id: catalogueId,
      employee_id: appUser.employee_id,
      subject,
      description,
      priority,
      sla_due_at: slaDueAt,
    })
    .select("id, employees(name)")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("service_request_status_history").insert({
    service_request_id: created.id,
    from_status: null,
    to_status: "Submitted",
    changed_by: user.id,
  });

  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    action: "service_request.submitted",
    resourceType: "service_request",
    resourceId: created.id,
    eventCategory: "workflow",
    after: { subject, priority },
  });

  const empName = (created.employees as unknown as { name: string } | null)?.name ?? "An employee";
  // Routed through the Area 09 governed pipeline (spec §3's Area 07 row:
  // "Case creation ... events"). The catalogue's hr.case.created resolves
  // to hr_role directly off the case's own org — the direct manager isn't
  // included here (that's a deliberate narrowing vs. the old
  // getHrAndManagerRecipients call; the Manager Workspace's own case list
  // covers that visibility instead, see Area 09 summary).
  const caseCreatedEventId = await emitNotificationEvent(supabase, {
    orgId: appUser.org_id,
    eventType: "hr.case.created",
    aggregateType: "service_request",
    aggregateId: created.id,
    actorId: user.id,
    idempotencyKey: `hr.case.created:${created.id}`,
    payload: {
      caseId: created.id,
      defaultTitle: "New HR service request",
      defaultMessage: `${empName}: ${subject}`,
      defaultActionUrl: `/dashboard/service-requests/${created.id}`,
    },
  });
  if (caseCreatedEventId) {
    await processEventImmediately(createAdminClient(), caseCreatedEventId).catch((err) => console.error("processEventImmediately failed:", err));
  }

  revalidatePath("/dashboard/service-requests");
}

export async function updateServiceRequestStatus(requestId: string, newStatus: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can change status.");

  const { data: current } = await supabase.from("service_requests").select("status, employee_id").eq("id", requestId).single();

  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === "Resolved" || newStatus === "Closed") patch.resolved_at = new Date().toISOString();

  const { error } = await supabase.from("service_requests").update(patch).eq("id", requestId);
  if (error) throw new Error(error.message);

  await supabase.from("service_request_status_history").insert({
    service_request_id: requestId,
    from_status: current?.status ?? null,
    to_status: newStatus,
    changed_by: user.id,
  });

  if (current?.employee_id) {
    const employeeUserId = await getEmployeeUserId(supabase, current.employee_id);
    if (employeeUserId) {
      await createNotification(supabase, {
        orgId: appUser.org_id,
        recipientUserId: employeeUserId,
        type: "SERVICE_REQUEST_STATUS_CHANGED",
        category: "service_request",
        priority: "information",
        title: "Your HR request was updated",
        message: `Status changed to ${newStatus}.`,
        entityType: "service_request",
        entityId: requestId,
        actionUrl: `/dashboard/service-requests/${requestId}`,
      });
    }
  }

  revalidatePath(`/dashboard/service-requests/${requestId}`);
  revalidatePath("/dashboard/service-requests");
}

export async function assignServiceRequest(requestId: string, assignedTo: string) {
  const supabase = await createClient();
  const { data: appUser } = await supabase.auth.getUser();
  const { data: caller } = await supabase.from("app_users").select("org_id, role").eq("id", appUser.user!.id).maybeSingle();
  if (!caller || !["admin", "hr"].includes(caller.role)) throw new Error("Only admin/HR can assign.");

  const { error } = await supabase.from("service_requests").update({ assigned_to: assignedTo, status: "Assigned" }).eq("id", requestId);
  if (error) throw new Error(error.message);

  await supabase.from("service_request_status_history").insert({
    service_request_id: requestId,
    to_status: "Assigned",
    changed_by: appUser.user!.id,
  });

  // Area 09 hr.case.assigned — previously this action had NO notification
  // at all (confirmed during the Area 09 survey); the "case_assignee"
  // recipient selector re-reads service_requests.assigned_to by this exact
  // request id (just updated above), never trusting the assignedTo
  // argument directly.
  const assignedEventId = await emitNotificationEvent(supabase, {
    orgId: caller.org_id,
    eventType: "hr.case.assigned",
    aggregateType: "service_request",
    aggregateId: requestId,
    actorId: appUser.user!.id,
    idempotencyKey: `hr.case.assigned:${requestId}:${assignedTo}`,
    payload: {
      caseId: requestId,
      assigneeUserId: assignedTo,
      defaultTitle: "An HR case was assigned to you",
      defaultMessage: "Review and action this HR service request.",
      defaultActionUrl: `/dashboard/service-requests/${requestId}`,
    },
  });
  if (assignedEventId) {
    await processEventImmediately(createAdminClient(), assignedEventId).catch((err) => console.error("processEventImmediately failed:", err));
  }

  revalidatePath(`/dashboard/service-requests/${requestId}`);
}

export async function addServiceMessage(requestId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  const isHrLike = appUser && ["admin", "hr"].includes(appUser.role);

  const message = String(formData.get("message") || "").trim();
  if (!message) throw new Error("Enter a message.");
  const internalOnly = isHrLike && formData.get("internal_only") === "on";

  const { error } = await supabase.from("service_request_messages").insert({
    service_request_id: requestId,
    author_user_id: user.id,
    message,
    internal_only: internalOnly,
  });
  if (error) throw new Error(error.message);

  if (!internalOnly && appUser) {
    const { data: request } = await supabase.from("service_requests").select("employee_id").eq("id", requestId).single();
    if (request) {
      if (isHrLike) {
        const employeeUserId = await getEmployeeUserId(supabase, request.employee_id);
        if (employeeUserId && employeeUserId !== user.id) {
          await createNotification(supabase, {
            orgId: appUser.org_id,
            recipientUserId: employeeUserId,
            type: "SERVICE_REQUEST_REPLY",
            category: "service_request",
            priority: "information",
            title: "New reply on your HR request",
            message,
            entityType: "service_request",
            entityId: requestId,
            actionUrl: `/dashboard/service-requests/${requestId}`,
          });
        }
      } else {
        const recipients = await getHrAndManagerRecipients(supabase, appUser.org_id, request.employee_id);
        await createNotificationForMany(supabase, recipients, {
          orgId: appUser.org_id,
          type: "SERVICE_REQUEST_REPLY",
          category: "service_request",
          priority: "information",
          title: "New reply on an HR request",
          message,
          entityType: "service_request",
          entityId: requestId,
          actionUrl: `/dashboard/service-requests/${requestId}`,
        });
      }
    }
  }

  revalidatePath(`/dashboard/service-requests/${requestId}`);
}
