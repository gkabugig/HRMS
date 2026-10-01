// Area 09 §21 Manager Notification Workspace.
//
// Two different kinds of data feed this page, and they are kept
// deliberately separate rather than merged into one undifferentiated list:
//
//   1. The manager's OWN governed notifications (the `notifications` table,
//      RLS-restricted to recipient_user_id = auth.uid()) — this is where
//      "pending approvals assigned to me", "HR cases assigned to me", and
//      "escalated to me" already live, because the Area 09 recipient
//      resolver puts the manager there directly when they're the approver/
//      assignee/escalation target. No new query needed for these; getting
//      them right is just filtering getNotifications()'s output.
//
//   2. Team-scoped worklists for things that do NOT land in the manager's
//      own notifications row (the notification went to the employee or to
//      hr_role, not to the manager) but that the manager still needs
//      visibility into: overdue team workflow tasks, and open team HR
//      cases. Each query runs on the caller's own session client, so
//      whatever RLS actually grants a manager is exactly what comes back —
//      "where policy permits" (spec §21) is enforced by Postgres, not by
//      this function deciding what a manager is allowed to see.
//
// Document acknowledgements are deliberately NOT included here: no RLS
// policy grants managers read access to document_acknowledgements (only
// the employee themselves and hr/admin can read it), so "in manager scope
// where policy permits" currently resolves to "not permitted" for a plain
// line manager. Disclosed as a scope note rather than silently working
// around it with an admin client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRow } from "@/lib/notifications/notification-types";

export type ManagerOverdueTask = {
  id: string;
  task: string;
  dueAt: string | null;
  workflowRunId: string;
  entityType: string;
};

export type ManagerTeamCase = {
  id: string;
  employeeId: string;
  employeeName: string;
  subject: string;
  priority: string;
  status: string;
  slaDueAt: string | null;
};

export type ManagerNotificationWorkspace = {
  ownNotifications: NotificationRow[];
  escalationQueue: NotificationRow[];
  overdueTeamTasks: ManagerOverdueTask[];
  teamCasesNeedingInput: ManagerTeamCase[];
};

export async function getManagerNotificationWorkspace(
  supabase: SupabaseClient,
  ownNotifications: NotificationRow[]
): Promise<ManagerNotificationWorkspace> {
  const [{ data: tasks }, { data: cases }] = await Promise.all([
    supabase
      .from("workflow_tasks")
      .select("id, task, due_at, workflow_run_id, workflow_runs!inner(entity_type)")
      .is("completed_at", null)
      .not("due_at", "is", null)
      .lt("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(50),
    supabase
      .from("service_requests")
      .select("id, employee_id, subject, priority, status, sla_due_at, employees(name)")
      .in("status", ["Submitted", "In Progress"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const overdueTeamTasks: ManagerOverdueTask[] = ((tasks as unknown as {
    id: string;
    task: string;
    due_at: string | null;
    workflow_run_id: string;
    workflow_runs: { entity_type: string };
  }[]) ?? []).map((t) => ({
    id: t.id,
    task: t.task,
    dueAt: t.due_at,
    workflowRunId: t.workflow_run_id,
    entityType: t.workflow_runs?.entity_type ?? "unknown",
  }));

  const teamCasesNeedingInput: ManagerTeamCase[] = ((cases as unknown as {
    id: string;
    employee_id: string;
    subject: string;
    priority: string;
    status: string;
    sla_due_at: string | null;
    employees: { name: string } | null;
  }[]) ?? []).map((c) => ({
    id: c.id,
    employeeId: c.employee_id,
    employeeName: c.employees?.name ?? "—",
    subject: c.subject,
    priority: c.priority,
    status: c.status,
    slaDueAt: c.sla_due_at,
  }));

  const relevantCategories = new Set(["approval", "service_request"]);
  const ownRelevant = ownNotifications.filter((n) => relevantCategories.has(n.category) || n.requires_action);
  const escalationQueue = ownRelevant.filter((n) => n.escalation_stage > 0);

  return { ownNotifications: ownRelevant, escalationQueue, overdueTeamTasks, teamCasesNeedingInput };
}
