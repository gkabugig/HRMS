import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { processEventImmediately } from "@/lib/notifications/scheduler";

const WARNING_WINDOW_HOURS = 2; // warn once an open case is within 2h of its SLA deadline

// Area 09 §3/§6 hr.case.sla_warning / hr.case.sla_breached. Nothing in
// Area 07 evaluated service_requests.sla_due_at before Area 09 — it was
// display-only. Idempotent via the same notified-once-marker pattern as
// Area 08's document expiry sweep (sla_warning_notified_at/
// sla_breach_notified_at, set the moment each fires).
export async function sweepServiceRequestSlas(admin: SupabaseClient): Promise<{ warned: number; breached: number }> {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + WARNING_WINDOW_HOURS * 3600_000).toISOString();

  const { data: dueSoon } = await admin
    .from("service_requests")
    .select("id, org_id, subject, sla_due_at")
    .not("sla_due_at", "is", null)
    .not("status", "in", "(Resolved,Closed)")
    .is("sla_warning_notified_at", null)
    .lte("sla_due_at", warningThreshold)
    .gt("sla_due_at", now.toISOString());

  let warned = 0;
  for (const r of dueSoon ?? []) {
    await admin.from("service_requests").update({ sla_warning_notified_at: new Date().toISOString() }).eq("id", r.id);
    const eventId = await emitNotificationEvent(admin, {
      orgId: r.org_id,
      eventType: "hr.case.sla_warning",
      aggregateType: "service_request",
      aggregateId: r.id,
      idempotencyKey: `hr.case.sla_warning:${r.id}`,
      payload: {
        caseId: r.id,
        defaultTitle: "HR case approaching SLA deadline",
        defaultMessage: `"${r.subject}" is due by ${r.sla_due_at}.`,
        defaultActionUrl: `/dashboard/service-requests/${r.id}`,
      },
    });
    if (eventId) await processEventImmediately(admin, eventId).catch((err) => console.error("processEventImmediately failed:", err));
    warned++;
  }

  const { data: breached } = await admin
    .from("service_requests")
    .select("id, org_id, subject, sla_due_at")
    .not("sla_due_at", "is", null)
    .not("status", "in", "(Resolved,Closed)")
    .is("sla_breach_notified_at", null)
    .lte("sla_due_at", now.toISOString());

  let breachedCount = 0;
  for (const r of breached ?? []) {
    await admin.from("service_requests").update({ sla_breach_notified_at: new Date().toISOString() }).eq("id", r.id);
    const eventId = await emitNotificationEvent(admin, {
      orgId: r.org_id,
      eventType: "hr.case.sla_breached",
      aggregateType: "service_request",
      aggregateId: r.id,
      idempotencyKey: `hr.case.sla_breached:${r.id}`,
      payload: {
        caseId: r.id,
        defaultTitle: "HR case breached its SLA",
        defaultMessage: `"${r.subject}" was due by ${r.sla_due_at} and is still open.`,
        defaultActionUrl: `/dashboard/service-requests/${r.id}`,
      },
    });
    if (eventId) await processEventImmediately(admin, eventId).catch((err) => console.error("processEventImmediately failed:", err));
    breachedCount++;
  }

  return { warned, breached: breachedCount };
}
