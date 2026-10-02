import type { SupabaseClient } from "@supabase/supabase-js";
import { writeDocumentEvent } from "./events";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { processEventImmediately } from "@/lib/notifications/scheduler";

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
      "id, document_id, warning_days, notified_at, employee_documents(id, org_id:employees!employee_id(org_id), employee_id, expiry_date, title, doc_type, lifecycle_state)"
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

    // Routed through the governed pipeline — the catalogue's
    // document.expiry.warning event already resolves both the employee
    // and hr_role, so this replaces the hand-rolled recipient set above.
    // `supabase` here is already the service-role admin client (this
    // function only ever runs from the cron route), so processing can
    // happen inline without a second client.
    const expiryEventId = await emitNotificationEvent(supabase, {
      orgId,
      eventType: "document.expiry.warning",
      aggregateType: "employee_documents",
      aggregateId: doc.id,
      idempotencyKey: `document.expiry.warning:${doc.id}:${row.id}`,
      payload: {
        documentId: doc.id,
        employeeId: doc.employee_id,
        defaultTitle: "Document expiring soon",
        defaultMessage: `${doc.title ?? doc.doc_type} expires on ${doc.expiry_date} (${row.warning_days} days' notice).`,
        defaultActionUrl: "/dashboard/documents/expiring",
      },
    });
    if (expiryEventId) {
      await processEventImmediately(supabase, expiryEventId).catch((err) => console.error("processEventImmediately failed:", err));
    }
    warningsSent++;
  }

  // Flip lifecycle_state to 'expired' for anything whose expiry_date has
  // actually passed and hasn't already been voided/superseded/archived.
  const { data: expiredDocs, error: expiredErr } = await supabase
    .from("employee_documents")
    .select("id, employees!employee_id(org_id)")
    .lt("expiry_date", todayStr)
    .in("lifecycle_state", ["issued", "acknowledged"]);
  if (expiredErr) throw new Error(expiredErr.message);

  for (const doc of expiredDocs ?? []) {
    await supabase.from("employee_documents").update({ lifecycle_state: "expired" }).eq("id", doc.id);
    const orgRow = doc.employees as unknown as { org_id: string } | { org_id: string }[] | null;
    const orgId = Array.isArray(orgRow) ? orgRow[0]?.org_id : orgRow?.org_id;
    if (orgId) {
      await writeDocumentEvent(supabase, { orgId, documentId: doc.id as string, eventType: "document.expired" });
      const { data: fullDoc } = await supabase.from("employee_documents").select("employee_id, title, doc_type").eq("id", doc.id).maybeSingle();
      if (fullDoc?.employee_id) {
        const expiredEventId = await emitNotificationEvent(supabase, {
          orgId,
          eventType: "document.expired",
          aggregateType: "employee_documents",
          aggregateId: doc.id as string,
          idempotencyKey: `document.expired:${doc.id}`,
          payload: {
            documentId: doc.id,
            employeeId: fullDoc.employee_id,
            defaultTitle: "A document has expired",
            defaultMessage: `${fullDoc.title ?? fullDoc.doc_type ?? "A document"} has expired and requires action.`,
            defaultActionUrl: "/dashboard/documents/expiring",
          },
        });
        if (expiredEventId) {
          await processEventImmediately(supabase, expiredEventId).catch((err) => console.error("processEventImmediately failed:", err));
        }
      }
    }
  }

  return { warningsSent, expired: expiredDocs?.length ?? 0 };
}
