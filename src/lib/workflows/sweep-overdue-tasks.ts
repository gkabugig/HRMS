import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { processEventImmediately } from "@/lib/notifications/scheduler";

// Area 09 workflow.task.overdue (spec §3 Area 03 row). workflow_tasks.due_at
// existed before Area 09 but nothing evaluated it — same gap as
// service_requests.sla_due_at, same notified-once-marker fix.
export async function sweepOverdueWorkflowTasks(admin: SupabaseClient): Promise<{ notified: number }> {
  const { data: overdue } = await admin
    .from("workflow_tasks")
    .select("id, task, due_at, workflow_runs!inner(org_id)")
    .not("due_at", "is", null)
    .is("completed_at", null)
    .is("overdue_notified_at", null)
    .lt("due_at", new Date().toISOString());

  let notified = 0;
  for (const t of (overdue as unknown as { id: string; task: string; due_at: string; workflow_runs: { org_id: string } }[]) ?? []) {
    await admin.from("workflow_tasks").update({ overdue_notified_at: new Date().toISOString() }).eq("id", t.id);
    const eventId = await emitNotificationEvent(admin, {
      orgId: t.workflow_runs.org_id,
      eventType: "workflow.task.overdue",
      aggregateType: "workflow_task",
      aggregateId: t.id,
      idempotencyKey: `workflow.task.overdue:${t.id}`,
      payload: {
        taskId: t.id,
        defaultTitle: "Workflow task overdue",
        defaultMessage: `"${t.task}" was due ${t.due_at} and is still open.`,
        defaultActionUrl: "/dashboard/me/tasks",
      },
    });
    if (eventId) await processEventImmediately(admin, eventId).catch((err) => console.error("processEventImmediately failed:", err));
    notified++;
  }

  return { notified };
}
