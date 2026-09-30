import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "./create-notification";
import { startWorkflowRun, PRIORITY_WORKFLOW_KEYS } from "@/lib/workflows/start-workflow-run";

// Date-driven reminders (spec §19: "Contract expiring", "Probation
// ending") have no natural trigger — nothing clicks a button on the day a
// contract turns 14-days-from-expiry. Rather than stand up a scheduled job
// this app has no infrastructure for, the reminder is swept into
// existence the moment someone who'd care opens their notification panel,
// scoped to exactly the rows RLS already lets them see (their own team for
// a manager, the whole org for HR/admin) — then the unique constraint on
// notifications makes this idempotent, so opening the panel twice a day
// never creates duplicates.
export async function sweepReminderNotifications(
  supabase: SupabaseClient,
  orgId: string,
  recipientUserId: string,
  role: string
): Promise<void> {
  if (role !== "admin" && role !== "hr" && role !== "manager") return;

  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date();
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().slice(0, 10);

  const [{ data: expiringContracts }, { data: endingProbation }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, employee_id, expiry_date, employees(name)")
      .eq("doc_type", "Contract")
      .not("expiry_date", "is", null)
      .lte("expiry_date", in14DaysStr)
      .gte("expiry_date", today),
    supabase
      .from("employees")
      .select("id, name, probation_end_date")
      .not("probation_end_date", "is", null)
      .lte("probation_end_date", in14DaysStr)
      .gte("probation_end_date", today),
  ]);

  await Promise.all([
    ...(expiringContracts ?? []).map((doc) => {
      const emp = doc.employees as unknown as { name: string } | null;
      return createNotification(supabase, {
        orgId,
        recipientUserId,
        type: "CONTRACT_EXPIRING",
        category: "compliance",
        priority: "reminder",
        title: "Contract expiring",
        message: `${emp?.name ?? "An employee"}'s contract expires ${doc.expiry_date}.`,
        entityType: "employee",
        entityId: doc.employee_id as string,
        actionUrl: `/dashboard/employees/${doc.employee_id}?tab=documents`,
      });
    }),
    ...(endingProbation ?? []).map((e) =>
      createNotification(supabase, {
        orgId,
        recipientUserId,
        type: "PROBATION_ENDING",
        category: "compliance",
        priority: "reminder",
        title: "Probation ending",
        message: `${e.name}'s probation ends ${e.probation_end_date}.`,
        entityType: "employee",
        entityId: e.id as string,
        actionUrl: `/dashboard/employees/${e.id}?tab=employment`,
      })
    ),
  ]);

  // Contract Renewal (priority workflow #3) — one run per expiring
  // contract document, started the same moment the reminder above first
  // fires for it. startWorkflowRun itself doesn't dedupe, so this checks
  // for an existing running/completed run against the same document first;
  // sweeping this twice a day should never open a second run for the same
  // contract.
  for (const doc of expiringContracts ?? []) {
    const { count: existingRuns } = await supabase
      .from("workflow_runs")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", "employee_document")
      .eq("entity_id", doc.id as string);
    if (existingRuns && existingRuns > 0) continue;

    await startWorkflowRun(supabase, {
      orgId,
      key: PRIORITY_WORKFLOW_KEYS.CONTRACT_RENEWAL,
      entityType: "employee_document",
      entityId: doc.id as string,
      tasks: [{ task: `Renew or formally end contract expiring ${doc.expiry_date}`, assigneeRole: "hr" }],
    });
  }
}
