import type { SupabaseClient } from "@supabase/supabase-js";
import { channelAdapters } from "./channels";
import { lookupDestination } from "./channels/destinations";

// Area 09 §17 Digests. Run once daily (see vercel.json); on Mondays it
// also flushes the previous ISO week's weekly-digest groups. A "due"
// digest_group is any group key that is NOT today's/this-week's own key
// — i.e. its window has fully closed — so a user's items keep
// accumulating under today's key until the next run finds a closed one.
export async function sendDueDigests(admin: SupabaseClient): Promise<{ sent: number; recipients: number }> {
  const { data: rows } = await admin
    .from("notification_deliveries")
    .select("id, notification_id, channel, digest_group, notifications!inner(recipient_user_id, org_id, title, safe_preview, message, action_url)")
    .eq("status", "digested")
    .eq("channel", "email");

  type Row = {
    id: string;
    notification_id: string;
    channel: string;
    digest_group: string;
    notifications: { recipient_user_id: string; org_id: string; title: string; safe_preview: string | null; message: string; action_url: string | null };
  };
  const todayDaily = new Date().toISOString().slice(0, 10);
  const dueRows = ((rows as unknown as Row[]) ?? []).filter((r) => {
    // A weekly key starts with "W"; a daily key is a bare date. Either
    // way, "due" means it isn't the currently-open bucket.
    if (r.digest_group.startsWith("W")) {
      const weekStart = r.digest_group.slice(1);
      const daysSinceMonday = Math.floor((Date.now() - new Date(weekStart).getTime()) / 86400000);
      return daysSinceMonday >= 7;
    }
    return r.digest_group < todayDaily;
  });

  const byRecipient = new Map<string, Row[]>();
  for (const row of dueRows) {
    const key = `${row.notifications.recipient_user_id}:${row.digest_group}`;
    if (!byRecipient.has(key)) byRecipient.set(key, []);
    byRecipient.get(key)!.push(row);
  }

  let sent = 0;
  for (const [key, items] of byRecipient) {
    const [recipientUserId] = key.split(":");
    const destination = await lookupDestination(admin, "email", recipientUserId);
    if (!destination) continue;

    const bodyLines = items.map((i) => `<li><strong>${i.notifications.title}</strong> — ${i.notifications.safe_preview ?? i.notifications.message}</li>`).join("");
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;"><h2>Your HRMS digest</h2><ul>${bodyLines}</ul><p><a href="/dashboard/notifications">Open HRMS</a></p></div>`;

    const result = await channelAdapters.email.send({
      notificationId: items[0].notification_id,
      destination,
      title: `Your HRMS digest (${items.length} update${items.length > 1 ? "s" : ""})`,
      body: html,
    });

    if (result.accepted) {
      await admin
        .from("notification_deliveries")
        .update({ status: "delivered", delivered_at: new Date().toISOString(), provider_message_id: result.providerMessageId ?? null })
        .in("id", items.map((i) => i.id));
      sent++;
    }
  }

  return { sent, recipients: byRecipient.size };
}
