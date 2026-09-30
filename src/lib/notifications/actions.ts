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

  const [{ data: notifications }, { count: unreadCount }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, category, priority, title, message, entity_type, entity_id, action_url, is_read, read_at, created_at, expires_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("notifications").select("*", { count: "exact", head: true }).eq("is_read", false),
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
] as const;

export async function getNotificationPreferences() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notification_preferences")
    .select("notification_type, in_app, email, sms, push, digest_mode")
    .eq("user_id", user.id);

  const byType = new Map((data ?? []).map((r) => [r.notification_type, r]));
  return PREFERENCE_TYPES.map(
    (type) =>
      byType.get(type) ?? {
        notification_type: type,
        in_app: true,
        email: false,
        sms: false,
        push: false,
        digest_mode: "instant" as const,
      }
  );
}

export async function updateNotificationPreferences(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const rows = PREFERENCE_TYPES.map((type) => ({
    user_id: user.id,
    notification_type: type,
    in_app: formData.get(`${type}_in_app`) === "on",
    email: formData.get(`${type}_email`) === "on",
    sms: false,
    push: false,
    digest_mode: "instant",
  }));

  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,notification_type" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}
