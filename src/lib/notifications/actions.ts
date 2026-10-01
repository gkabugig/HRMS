"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { NotificationRow } from "./notification-types";
import { sweepReminderNotifications } from "./notification-rules";

export async function getNotifications(): Promise<{ notifications: NotificationRow[]; unreadCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [], unreadCount: 0 };

  const { data: appUser } = await supabase
    .from("app_users")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (appUser) {
    // Best-effort — a failed sweep should never break the notification panel.
    await sweepReminderNotifications(supabase, appUser.org_id, user.id, appUser.role).catch(() => {});
  }

  // Area 09: scheduled_for defaults to the create time for every row the
  // in-app channel actually sends (resolveChannelPlan never defers in_app
  // for quiet hours/digests), but filtering on it anyway is the correct,
  // forward-compatible contract the spec asks for rather than relying on
  // that implementation detail never changing. dismissed_at has no writer
  // yet (no dismiss action exists in the UI), so the filter is a no-op
  // today and free insurance once one is added.
  const nowIso = new Date().toISOString();
  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, type, category, priority, title, message, entity_type, entity_id, action_url, action_label, safe_preview, correlation_id, requires_action, is_mandatory, escalation_stage, is_read, read_at, created_at, expires_at"
      )
      .lte("scheduled_for", nowIso)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false)
      .lte("scheduled_for", nowIso)
      .is("dismissed_at", null),
  ]);

  return { notifications: (notifications ?? []) as NotificationRow[], unreadCount: unreadCount ?? 0 };
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("recipient_user_id", user.id)
    .eq("is_read", false);
  revalidatePath("/dashboard");
}

const PREFERENCE_TYPES = [
  "leave",
  "attendance",
  "payroll",
  "compliance",
  "training",
  "performance",
  "recruitment",
  "offboarding",
  "documents",
  "system",
  // Area 09 categories — added so the spec's "Workflow" (approvals/tasks/
  // cases) and "Informational" preference groups (§22) are actually
  // reachable here; previously these three categories had no row a user
  // could ever create, so resolveChannelPlan always fell back to its
  // hardcoded defaults (in_app on, email off) with no way to change them.
  "approval",
  "service_request",
  "self_service",
  // Area 11 — risk.detected/risk.resolved notifications.
  "risk",
] as const;

export type NotificationPreferenceRow = {
  notification_type: (typeof PREFERENCE_TYPES)[number];
  in_app: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  digest_mode: "instant" | "daily" | "weekly";
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  /** True when at least one active, mandatory notification_policy_rules
   * row exists for this category in the user's org. Mandatory events
   * always reach in-app (and, per that rule's allowed_channels, other
   * channels) regardless of these toggles — see resolveChannelPlan's
   * isCriticalOrMandatory bypass — so this is surfaced as a caveat on the
   * toggle rather than a disabled control: mandatory status is decided
   * per event type, not per whole category, and most of these categories
   * mix mandatory and optional events. */
  hasMandatoryEvents: boolean;
};

export async function getNotificationPreferences(): Promise<NotificationPreferenceRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();

  const [{ data }, { data: mandatoryRules }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("notification_type, in_app, email, sms, push, digest_mode, quiet_hours_start, quiet_hours_end, timezone")
      .eq("user_id", user.id),
    appUser
      ? supabase
          .from("notification_policy_rules")
          .select("category")
          .eq("org_id", appUser.org_id)
          .eq("is_active", true)
          .eq("mandatory", true)
      : Promise.resolve({ data: [] as { category: string }[] }),
  ]);

  const mandatoryCategories = new Set((mandatoryRules ?? []).map((r) => r.category));
  const byType = new Map((data ?? []).map((r) => [r.notification_type, r]));
  return PREFERENCE_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      notification_type: type,
      in_app: row?.in_app ?? true,
      email: row?.email ?? false,
      sms: row?.sms ?? false,
      push: row?.push ?? false,
      digest_mode: (row?.digest_mode as NotificationPreferenceRow["digest_mode"]) ?? "instant",
      quiet_hours_start: row?.quiet_hours_start ?? null,
      quiet_hours_end: row?.quiet_hours_end ?? null,
      timezone: row?.timezone ?? null,
      hasMandatoryEvents: mandatoryCategories.has(type),
    };
  });
}

export async function updateNotificationPreferences(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const appUser = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();

  // Quiet hours and timezone are set once per user, not once per category
  // (spec §22's "Quiet Hours" row is its own preference group, not a
  // per-category field) — read from the shared fields the form submits
  // once, then stamp them onto every category row.
  const quietStart = (formData.get("quiet_hours_start") as string) || null;
  const quietEnd = (formData.get("quiet_hours_end") as string) || null;
  const timezone = (formData.get("timezone") as string) || null;

  const rows = PREFERENCE_TYPES.map((type) => ({
    user_id: user.id,
    org_id: appUser.data?.org_id ?? null,
    notification_type: type,
    in_app: formData.get(`${type}_in_app`) === "on",
    email: formData.get(`${type}_email`) === "on",
    sms: false,
    push: false,
    digest_mode: (formData.get(`${type}_digest`) as string) || "instant",
    quiet_hours_start: quietStart,
    quiet_hours_end: quietEnd,
    timezone,
  }));

  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,notification_type" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/notifications");
}
