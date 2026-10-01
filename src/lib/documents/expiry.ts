import type { SupabaseClient } from "@supabase/supabase-js";
import { writeDocumentEvent } from "./events";
import { createNotification } from "@/lib/notifications/create-notification";

// Area 08 §20 Expiry & Renewal Engine. Intended to run under the service
// role (via the cron route), which bypasses RLS entirely — this evaluates
// across the whole org, not one caller's scoped view. Never hard-codes a
// 90/60/30/7-day schedule: each document_expiries row was seeded at
// issue-time from its document_type's own expiry_warning_days_schedule
// (see lifecycle.ts's scheduleExpiryWarnings), so this function only has to
// ask "has today crossed this document's expiry_date minus its own
// warning_days, and have I not already notified for it."
export async function evaluateDocumentExpiries(supabase: SupabaseClient): Promise<{ warningsSent: number; expired: number }> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const { data: pending, error } = await supabase
    .from("document_expiries")
    .select(
      "id, document_id, warning_days, notified_at, employee_documents(id, org_id:employees(org_id), employee_id, expiry_date, title, doc_type, lifecycle_state)"
    )
    .is("notified_at", null);
  if (error) throw new Error(error.message);

  let warningsSent = 0;
  for (const row of pending ?? []) {
    const doc = row.employee_documents as unknown as {
      id: string;
      org_id: { org_id: string } | null;
      employee_id: string;
      expiry_date: string | null;
      title: string | null;
      doc_type: string;
      lifecycle_state: string;
    } | null;
    if (!doc?.expiry_date || !["issued", "acknowledged"].includes(doc.lifecycle_state)) continue;

    const expiryDate = new Date(doc.expiry_date);
    const warnAt = new Date(expiryDate);
    warnAt.setDate(warnAt.getDate() - row.warning_days);
    if (today < warnAt) continue;

    const orgId = doc.org_id?.org_id;
    if (!orgId) continue;

    await supabase.from("document_expiries").update({ notified_at: new Date().toISOString() }).eq("id", row.id);
    await writeDocumentEvent(supabase, {
      orgId,
      documentId: doc.id,
      eventType: "document.expiry_warning",
      metadata: { warningDays: row.warning_days, expiryDate: doc.expiry_date },
    });

    const { data: hrUsers } = await supabase.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]);
    const { data: employeeUser } = await supabase.from("app_users").select("id").eq("employee_id", doc.employee_id).maybeSingle();
    const recipients = new Set<string>((hrUsers ?? []).map((u) => u.id as string));
    if (employeeUser) recipients.add(employeeUser.id as string);

    for (const recipientUserId of recipients) {
      await createNotification(supabase, {
        orgId,
        recipientUserId,
        type: "DOCUMENT_EXPIRING",
        category: "documents",
        priority: row.warning_days <= 7 ? "action_required" : "reminder",
        title: "Document expiring soon",
        message: `${doc.title ?? doc.doc_type} expires on ${doc.expiry_date} (${row.warning_days} days' notice).`,
        entityType: "employee_documents",
        entityId: doc.id,
        actionUrl: "/dashboard/documents/expiring",
      });
    }
    warningsSent++;
  }

  // Flip lifecycle_state to 'expired' for anything whose expiry_date has
  // actually passed and hasn't already been voided/superseded/archived.
  const { data: expiredDocs, error: expiredErr } = await supabase
    .from("employee_documents")
    .select("id, employees(org_id)")
    .lt("expiry_date", todayStr)
    .in("lifecycle_state", ["issued", "acknowledged"]);
  if (expiredErr) throw new Error(expiredErr.message);

  for (const doc of expiredDocs ?? []) {
    await supabase.from("employee_documents").update({ lifecycle_state: "expired" }).eq("id", doc.id);
    const orgRow = doc.employees as unknown as { org_id: string } | { org_id: string }[] | null;
    const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
    if (orgId) {
      await writeDocumentEvent(supabase, { orgId, documentId: doc.id as string, eventType: "document.expired" });
    }
  }

  return { warningsSent, expired: expiredDocs?.length ?? 0 };
}
