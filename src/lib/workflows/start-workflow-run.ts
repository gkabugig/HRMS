import type { SupabaseClient } from "@supabase/supabase-js";
import { emitNotificationEvent } from "@/lib/notifications/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { processEventImmediately } from "@/lib/notifications/scheduler";

// Hard-wired priority-workflow run history (Phase 2 spec §20 — "Foundation +
// priority workflows first" scope: no visual builder, just the five named
// workflows recording what ran, directly from the server action that owns
// each triggering event). workflow_definitions is seeded per org (see
// 0024_phase2_seed.sql) with one row per key below; if a key isn't seeded
// yet for an org this quietly no-ops rather than throwing, so it never
// blocks the underlying action (creating the employee, submitting leave,
// etc.) that already succeeded before this is called.
export const PRIORITY_WORKFLOW_KEYS = {
  ONBOARDING: "employee_onboarding",
  LEAVE_APPROVAL: "leave_approval",
  CONTRACT_RENEWAL: "contract_renewal",
  EMPLOYEE_DATA_CHANGE: "employee_data_change",
  OFFBOARDING: "offboarding",
} as const;

export type WorkflowTaskInput = {
  task: string;
  assigneeUserId?: string | null;
  assigneeRole?: string | null;
  dueAt?: string | null;
};

export async function startWorkflowRun(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    key: string;
    entityType: string;
    entityId: string;
    tasks?: WorkflowTaskInput[];
  }
): Promise<string | null> {
  const { data: def } = await supabase
    .from("workflow_definitions")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("key", input.key)
    .eq("active", true)
    .maybeSingle();
  if (!def) return null;

  const { data: run, error } = await supabase
    .from("workflow_runs")
    .insert({ workflow_id: def.id, org_id: input.orgId, entity_type: input.entityType, entity_id: input.entityId })
    .select("id")
    .single();
  if (error || !run) return null;

  if (input.tasks && input.tasks.length > 0) {
    const { data: insertedTasks } = await supabase
      .from("workflow_tasks")
      .insert(
        input.tasks.map((t) => ({
          workflow_run_id: run.id,
          task: t.task,
          assignee_user_id: t.assigneeUserId ?? null,
          assignee_role: t.assigneeRole ?? null,
          due_at: t.dueAt ?? null,
        }))
      )
      .select("id, task");

    // Area 09 workflow.task.assigned (spec §3 Area 03 row). Only tasks
    // with an owner at creation time (user or role) have anyone to tell —
    // a task with neither is picked up manually, same as before.
    for (const t of insertedTasks ?? []) {
      const eventId = await emitNotificationEvent(supabase, {
        orgId: input.orgId,
        eventType: "workflow.task.assigned",
        aggregateType: "workflow_task",
        aggregateId: t.id,
        idempotencyKey: `workflow.task.assigned:${t.id}`,
        payload: {
          taskId: t.id,
          defaultTitle: "New workflow task assigned",
          defaultMessage: t.task,
          defaultActionUrl: "/dashboard/me/tasks",
        },
      });
      if (eventId) await processEventImmediately(createAdminClient(), eventId).catch((err) => console.error("processEventImmediately failed:", err));
    }
  }

  await supabase.from("workflow_logs").insert({
    workflow_run_id: run.id,
    step: "started",
    event: `${input.key} run started for ${input.entityType} ${input.entityId}`,
  });

  return run.id as string;
}

export async function completeWorkflowRun(supabase: SupabaseClient, runId: string, status: "completed" | "failed" = "completed") {
  await supabase.from("workflow_runs").update({ status, completed_at: new Date().toISOString() }).eq("id", runId);
  await supabase.from("workflow_logs").insert({ workflow_run_id: runId, step: status, event: `Run marked ${status}` });
}
