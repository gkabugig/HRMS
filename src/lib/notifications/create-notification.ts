import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateNotificationInput } from "./notification-types";

// Called directly from the server action behind a business event (spec
// §18: "Notifications should be generated from business events, not from
// UI button clicks alone" — this is still invoked from a Server Action,
// but always as a side effect of the event the action represents: a leave
// request being submitted, a decision being recorded, an exception being
// detected — never as its own standalone click target).
//
// Dedupe (spec: "Deduplicate repeated notifications") is handled by the
// notifications table's unique(recipient_user_id, type, entity_type,
// entity_id) constraint — upsert with ignoreDuplicates so calling this
// twice for the same event is a safe no-op rather than a second row.
export async function createNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<void> {
  await supabase
    .from("notifications")
    .upsert(
      {
        org_id: input.orgId,
        recipient_user_id: input.recipientUserId,
        type: input.type,
        category: input.category,
        priority: input.priority,
        title: input.title,
        message: input.message,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        action_url: input.actionUrl ?? null,
        expires_at: input.expiresAt ?? null,
      },
      { onConflict: "recipient_user_id,type,entity_type,entity_id", ignoreDuplicates: true }
    );
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
