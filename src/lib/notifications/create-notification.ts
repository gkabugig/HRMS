import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateNotificationInput } from "./notification-types";

// Area 09 security fix: this used to be a raw `.from("notifications").upsert(...)`.
// A live RLS audit for Area 09 found the table's own INSERT policy let any
// authenticated org member insert an arbitrary notification (any title/
// message/action_url/priority) addressed to any OTHER org member — a
// direct phishing/spoofing vector reachable by any browser REST call,
// bypassing this helper entirely. The policy is now locked to `false` and
// every insert goes through the `create_notification_secure` SECURITY
// DEFINER function instead, which re-validates org/recipient membership
// and (for is_mandatory) provenance against an active policy rule. This
// file's exported signature is unchanged, so none of the ~11 existing
// callers (leave, attendance, documents, workflows, approvals,
// service-requests, …) needed to change.
//
// Dedupe (spec: "Deduplicate repeated notifications") is still handled by
// the notifications table's unique(recipient_user_id, type, entity_type,
// entity_id) constraint — the RPC does `on conflict ... do nothing`, so
// calling this twice for the same event is a safe no-op.
export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_notification_secure", {
    p_org_id: input.orgId,
    p_recipient_user_id: input.recipientUserId,
    p_type: input.type,
    p_category: input.category,
    p_priority: input.priority,
    p_title: input.title,
    p_message: input.message,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_action_url: input.actionUrl ?? null,
    p_action_label: input.actionLabel ?? null,
    p_expires_at: input.expiresAt ?? null,
    p_safe_preview: input.safePreview ?? null,
    p_event_id: input.eventId ?? null,
    p_template_id: input.templateId ?? null,
    p_correlation_id: input.correlationId ?? null,
    p_requires_action: input.requiresAction ?? false,
    p_is_mandatory: input.isMandatory ?? false,
    p_scheduled_for: input.scheduledFor ?? null,
    p_escalation_stage: input.escalationStage ?? 0,
    p_escalated_from_id: input.escalatedFromId ?? null,
  });
  if (error) {
    // Mirrors the old upsert's fire-and-forget posture for legacy callers
    // (a failed notification should never break the business action it
    // rides along with) but still surfaces the failure for callers that
    // want it (the Area 09 orchestrator checks the return value).
    console.error("createNotification failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

// Fan-out helper: same notification content to several recipients (e.g. a
// leave request submitted → every admin/hr user, not just one).
export async function createNotificationForMany(
  supabase: SupabaseClient,
  recipientUserIds: string[],
  input: Omit<CreateNotificationInput, "recipientUserId">
): Promise<void> {
  await Promise.all(
    recipientUserIds.map((recipientUserId) => createNotification(supabase, { ...input, recipientUserId }))
  );
}
