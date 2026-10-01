import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationCategory, NotificationPriority } from "@/lib/notifications/notification-types";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { getManagerRecipient, getEmployeeUserId, getHrAndManagerRecipients } from "@/lib/notifications/recipients";
import { renderTemplate } from "./template";

// Config shape for a workflow_nodes row of type 'notification'. Templates
// are rendered against the run's context_json (renderTemplate), so a
// seeded node can reference anything the triggering event's payload or a
// prior node's output put there (e.g. {fieldLabel}, {decision}).
export type NotificationNodeConfig = {
  audience: "manager" | "employee" | "hr";
  type: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message_template: string;
  action_url?: string;
  // Which context_json key holds the subject employee's id — defaults to
  // "employeeId" so most seeded nodes don't need to set this at all.
  employee_id_field?: string;
};

export async function runNotificationNode(
  supabase: SupabaseClient,
  orgId: string,
  config: NotificationNodeConfig,
  context: Record<string, unknown>
): Promise<void> {
  const employeeIdField = config.employee_id_field ?? "employeeId";
  const employeeId = context[employeeIdField] as string | undefined;
  if (!employeeId) return; // nothing to notify about without a subject employee

  const base = {
    orgId,
    type: renderTemplate(config.type, context),
    category: config.category ?? "self_service",
    priority: config.priority ?? "information",
    title: renderTemplate(config.title, context),
    message: renderTemplate(config.message_template, context),
    entityType: context.entityType as string | undefined,
    entityId: context.entityId as string | undefined,
    actionUrl: config.action_url,
  };

  if (config.audience === "manager") {
    const recipients = await getManagerRecipient(supabase, employeeId);
    if (recipients.length > 0) await createNotificationForMany(supabase, recipients, base);
  } else if (config.audience === "employee") {
    const userId = await getEmployeeUserId(supabase, employeeId);
    if (userId) await createNotification(supabase, { ...base, recipientUserId: userId });
  } else {
    const recipients = await getHrAndManagerRecipients(supabase, orgId, employeeId);
    if (recipients.length > 0) await createNotificationForMany(supabase, recipients, base);
  }
}
