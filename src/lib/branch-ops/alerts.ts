// Owner alerts for Branch Operations: WhatsApp to the numbers in
// branch_ops_settings, plus an in-app notification to every admin, recorded
// once in branch_ops_alerts so a job that runs twice never alerts twice.
import type { Db } from "@/lib/hub/context";
import { notify, userIdsWhere } from "@/lib/hub/context";
import { sendWhatsApp } from "@/lib/notifications/channels/whatsapp";

export type OpsSettings = { report_deadline: string; cash_variance_threshold: number; owner_whatsapp_numbers: string[]; photo_retention_days: number };

export const DEFAULT_SETTINGS: OpsSettings = { report_deadline: "22:30", cash_variance_threshold: 500, owner_whatsapp_numbers: [], photo_retention_days: 90 };

export async function loadSettings(db: Db, orgId: string): Promise<OpsSettings> {
  const { data } = await db.from("branch_ops_settings").select("report_deadline, cash_variance_threshold, owner_whatsapp_numbers, photo_retention_days").eq("org_id", orgId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    report_deadline: String(data.report_deadline).slice(0, 5),
    cash_variance_threshold: Number(data.cash_variance_threshold),
    owner_whatsapp_numbers: (data.owner_whatsapp_numbers as string[]) ?? [],
    photo_retention_days: Number(data.photo_retention_days),
  };
}

export type AlertKey = {
  orgId: string;
  type: "branch_not_open" | "late" | "absent" | "report_reminder" | "report_missing" | "daily_summary" | "cash_variance" | "incident";
  date: string;
  branchId?: string | null;
  employeeId?: string | null;
};

// Claims the alert slot first; returns false when it was already sent.
async function claim(db: Db, k: AlertKey, detail: string): Promise<string | null> {
  const { data, error } = await db
    .from("branch_ops_alerts")
    .insert({ org_id: k.orgId, alert_type: k.type, alert_date: k.date, branch_id: k.branchId ?? null, employee_id: k.employeeId ?? null, detail: detail.slice(0, 2000) })
    .select("id")
    .single();
  if (error) return null; // unique violation = already sent
  return data.id as string;
}

// Send one or more messages to the owners. Returns how many WhatsApp
// messages were accepted (0 if WhatsApp isn't configured or the alert was
// already sent).
export async function alertOwners(db: Db, settings: OpsSettings, key: AlertKey, messages: string[], inApp?: { title: string; actionUrl: string }): Promise<number> {
  if (!messages.length) return 0;
  const id = await claim(db, key, messages.join(" | "));
  if (!id) return 0;
  let accepted = 0;
  for (const to of settings.owner_whatsapp_numbers) {
    for (const m of messages) {
      const r = await sendWhatsApp(to, m);
      if (r.accepted) accepted++;
    }
  }
  await db.from("branch_ops_alerts").update({ delivered: accepted > 0 }).eq("id", id);
  if (inApp) {
    const admins = await userIdsWhere(db, key.orgId, ["admin"]);
    await notify(db, { orgId: key.orgId, userIds: admins, type: `BRANCH_OPS_${key.type.toUpperCase()}`, category: "attendance", title: inApp.title, message: messages.join(" ").slice(0, 900), entityType: "branch_ops_alert", entityId: id, actionUrl: inApp.actionUrl });
  }
  return accepted;
}

// A message to one person (e.g. the branch manager's reminder).
export async function alertPerson(db: Db, key: AlertKey, phone: string | null, message: string): Promise<boolean> {
  const id = await claim(db, key, message);
  if (!id || !phone) return false;
  const r = await sendWhatsApp(phone, message);
  await db.from("branch_ops_alerts").update({ delivered: r.accepted }).eq("id", id);
  return r.accepted;
}
