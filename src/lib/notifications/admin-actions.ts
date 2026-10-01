"use server";

// Area 09 §23 Admin Notification Centre — template management/versioning,
// event-to-policy mapping, failed-delivery/dead-letter queues, suppression
// controls, test-send, provider health, and ID/recipient search. Every
// write here checks role itself (the "Only admin/HR can ..." pattern
// src/lib/documents/template-admin-actions.ts already established) in
// addition to the RLS policies that would reject it anyway — defense in
// depth, and a clearer error than a bare RLS denial.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { createNotification } from "./create-notification";
import { EVENT_CATALOGUE } from "./event-catalogue";
import type { NotificationCategory, NotificationPriority } from "./notification-types";

async function requireAdminOrHr(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only admin/HR can manage notification configuration.");
  }
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

// ---------- Policy mapping ----------

export async function updatePolicyRule(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireAdminOrHr(supabase);
  const id = formData.get("id") as string;
  const priority = formData.get("priority") as NotificationPriority;
  const mandatory = formData.get("mandatory") === "on";
  const quietHoursAllowed = formData.get("quiet_hours_allowed") === "on";
  const allowedChannels = (formData.getAll("allowed_channels") as string[]).filter(Boolean);
  const maxPerHourRaw = formData.get("max_per_hour") as string;

  const { error } = await supabase
    .from("notification_policy_rules")
    .update({
      priority,
      mandatory,
      quiet_hours_allowed: quietHoursAllowed,
      allowed_channels: allowedChannels.length > 0 ? allowedChannels : ["in_app"],
      max_per_hour: maxPerHourRaw ? Number(maxPerHourRaw) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    action: "notification_policy.updated",
    resourceType: "notification_policy_rules",
    resourceId: id,
    eventCategory: "configuration",
    after: { priority, mandatory, allowedChannels },
  });

  revalidatePath("/dashboard/notifications/admin/policies");
}

// ---------- Templates ----------

export async function createTemplateVersion(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);

  const templateKey = formData.get("template_key") as string;
  const eventType = formData.get("event_type") as string;
  const channel = formData.get("channel") as string;
  const locale = (formData.get("locale") as string) || "en-KE";
  const name = formData.get("name") as string;

  const { data: latest } = await supabase
    .from("notification_templates")
    .select("version")
    .eq("org_id", orgId)
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .eq("locale", locale)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const { error } = await supabase.from("notification_templates").insert({
    org_id: orgId,
    template_key: templateKey,
    version: nextVersion,
    name,
    event_type: eventType,
    channel,
    locale,
    subject_template: (formData.get("subject_template") as string) || null,
    body_template: formData.get("body_template") as string,
    safe_preview_template: (formData.get("safe_preview_template") as string) || null,
    action_label_template: (formData.get("action_label_template") as string) || null,
    action_url_template: (formData.get("action_url_template") as string) || null,
    is_mandatory: formData.get("is_mandatory") === "on",
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  // Deactivate the previous version of this exact (key, channel, locale) so
  // resolveTemplate's "latest active" lookup picks up the new one — the
  // immutability trigger (0084) only stops EDITING a used version, it
  // doesn't manage which version is "current".
  if (nextVersion > 1) {
    await supabase
      .from("notification_templates")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .eq("template_key", templateKey)
      .eq("channel", channel)
      .eq("locale", locale)
      .lt("version", nextVersion);
  }

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification_template.version_created",
    resourceType: "notification_templates",
    resourceId: templateKey,
    eventCategory: "configuration",
    after: { templateKey, channel, locale, version: nextVersion },
  });

  revalidatePath("/dashboard/notifications/admin/templates");
}

// ---------- Suppressions ----------

export async function createSuppression(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);

  const userIdTarget = (formData.get("user_id") as string) || null;
  const category = (formData.get("category") as string) || null;
  const channel = (formData.get("channel") as string) || null;
  const endsAt = (formData.get("ends_at") as string) || null;
  const reason = formData.get("reason") as string;
  if (!reason?.trim()) throw new Error("A reason is required for every suppression (audit trail).");

  const { data, error } = await supabase
    .from("notification_suppressions")
    .insert({
      org_id: orgId,
      user_id: userIdTarget,
      category,
      channel,
      ends_at: endsAt || null,
      reason,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification_suppression.created",
    resourceType: "notification_suppressions",
    resourceId: data.id,
    eventCategory: "configuration",
    after: { userIdTarget, category, channel, endsAt, reason },
  });

  revalidatePath("/dashboard/notifications/admin");
}

export async function endSuppression(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("notification_suppressions")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification_suppression.ended",
    resourceType: "notification_suppressions",
    resourceId: id,
    eventCategory: "configuration",
  });

  revalidatePath("/dashboard/notifications/admin");
}

// ---------- Dead letters ----------

export async function resolveDeadLetter(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const id = formData.get("id") as string;

  const { error } = await supabase
    .from("notification_dead_letters")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification_dead_letter.resolved",
    resourceType: "notification_dead_letters",
    resourceId: id,
    eventCategory: "configuration",
  });

  revalidatePath("/dashboard/notifications/admin");
}

// ---------- Failed deliveries: retry ----------

export async function retryFailedDelivery(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const id = formData.get("id") as string;

  // notification_deliveries has no admin/hr UPDATE policy at all today —
  // only the service-role orchestrator writes to it (by design: delivery
  // state is meant to be managed only by the pipeline, not hand-edited).
  // Confirm the caller can actually SEE this row under their own session
  // (notification_deliveries_hr_read, which itself depends on the
  // notifications_hr_admin_read grant added above) before reaching for the
  // admin client to perform the write — that ordering means a role/org
  // check happens under RLS first, and the elevated client is only used
  // for the one privileged step this feature genuinely needs.
  const { data: visible } = await supabase.from("notification_deliveries").select("id").eq("id", id).maybeSingle();
  if (!visible) throw new Error("Delivery not found or not visible to you.");

  const admin = createAdminClient();
  // Re-arms it for the next dispatch cron pass rather than sending
  // synchronously from here — reuses the exact same retry path a
  // scheduled retry takes.
  const { error } = await admin
    .from("notification_deliveries")
    .update({ status: "queued", next_retry_at: new Date().toISOString(), error_code: null, error_message: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification_delivery.retry_requeued",
    resourceType: "notification_deliveries",
    resourceId: id,
    eventCategory: "configuration",
  });

  revalidatePath("/dashboard/notifications/admin");
}

// ---------- Test-send ----------

// Spec §23 "Test-send capability using authorized synthetic/test
// recipients." The only recipient this can ever target is the acting
// admin/HR user themselves — never an arbitrary employee by id or email —
// so there is no way to use "test-send" to deliver unsolicited content to
// someone else. It creates a REAL notification row (visible in the
// sender's own inbox, through the same create_notification_secure() path
// every other notification uses), not a simulated preview.
export async function sendTestNotification(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);

  const eventType = formData.get("event_type") as string;
  const def = EVENT_CATALOGUE[eventType];
  const title = (formData.get("title") as string) || `[TEST] ${def?.description ?? eventType}`;
  const message = (formData.get("message") as string) || "This is a test notification you sent to yourself from the Admin Notification Centre.";

  const id = await createNotification(supabase, {
    orgId,
    recipientUserId: userId,
    type: `${eventType}.test`,
    category: (def?.category ?? "system") as NotificationCategory,
    priority: (def?.defaultPriority ?? "information") as NotificationPriority,
    title,
    message,
    safePreview: message,
  });
  if (!id) throw new Error("Test notification could not be created.");

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "notification.test_sent",
    resourceType: "notifications",
    resourceId: id,
    eventCategory: "configuration",
    after: { eventType },
  });

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard/notifications/admin");
}
