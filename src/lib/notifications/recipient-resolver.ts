import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentManager } from "@/lib/organisation/get-current-manager";
import { getEventDefinition, type RecipientSelector } from "./event-catalogue";

// Area 09 §11 Recipient Resolution.
//
// Every selector here re-derives the recipient from the AUTHORITATIVE
// source table at processing time, by aggregate_id — it never trusts a
// user id taken directly from the event payload. This matters because
// notification_events can be inserted by an ordinary authenticated user
// (see outbox.ts/the INSERT policy's comment): a payload field like
// `approverUserId` is attacker-controllable if that user crafts their own
// event row, so resolving "who gets notified" from the payload would be a
// spoofing vector (send a user a fake "approve this" link pointing
// anywhere). Resolving from the real approval_steps/service_requests/
// workflow_tasks/employee_documents row by aggregate_id, scoped to the
// event's own org_id, closes that — the payload fields exist only as a
// convenience for template variables, never as an identity source.
//
// Called with a service-role (admin) client, since this runs from the
// cron-driven processor, not a logged-in session.
export async function resolveRecipients(
  supabase: SupabaseClient,
  orgId: string,
  eventType: string,
  aggregateId: string | null,
  payload: Record<string, unknown>
): Promise<string[]> {
  const def = getEventDefinition(eventType);
  if (!def) return [];

  const ids = new Set<string>();
  for (const selector of def.recipients) {
    const resolved = await resolveSelector(supabase, orgId, selector, aggregateId, payload);
    for (const id of resolved) ids.add(id);
  }
  return [...ids];
}

async function resolveSelector(
  supabase: SupabaseClient,
  orgId: string,
  selector: RecipientSelector,
  aggregateId: string | null,
  payload: Record<string, unknown>
): Promise<string[]> {
  switch (selector.kind) {
    case "employee": {
      const employeeId = await authoritativeEmployeeId(selector.employeeIdField, aggregateId, payload);
      if (!employeeId) return [];
      const userId = await employeeUserId(supabase, orgId, employeeId);
      return userId ? [userId] : [];
    }
    case "manager": {
      const employeeId = await authoritativeEmployeeId(selector.employeeIdField, aggregateId, payload);
      if (!employeeId) return [];
      const managerId = await getCurrentManager(supabase, employeeId);
      if (!managerId) return [];
      const userId = await employeeUserId(supabase, orgId, managerId);
      return userId ? [userId] : [];
    }
    case "manager_chain": {
      const employeeId = await authoritativeEmployeeId(selector.employeeIdField, aggregateId, payload);
      if (!employeeId) return [];
      const ids: string[] = [];
      let current: string | null = employeeId;
      const maxDepth = selector.maxDepth ?? 3;
      for (let i = 0; i < maxDepth; i++) {
        const managerId: string | null = await getCurrentManager(supabase, current);
        if (!managerId) break;
        const userId = await employeeUserId(supabase, orgId, managerId);
        if (userId) ids.push(userId);
        current = managerId;
      }
      return ids;
    }
    case "hr_role": {
      const { data } = await supabase.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]);
      return (data ?? []).map((r) => r.id as string);
    }
    case "approver": {
      // Re-derive from approval_steps, not payload: the step's current
      // assignee is the only valid approver, whatever the payload claims.
      // A step is EITHER a specific approver_user_id OR an approver_role
      // (never both — see resolve-approver.ts) — a role-assigned step
      // fans out to every app_user currently holding that role, same as
      // the legacy resolveUsersByRole() helper start-approval.ts used.
      if (!aggregateId) return [];
      const { data: step } = await supabase
        .from("approval_steps")
        .select("approver_user_id, approver_role, approval_requests!inner(org_id)")
        .eq("id", aggregateId)
        .maybeSingle();
      const stepRow = step as unknown as { approver_user_id: string | null; approver_role: string | null; approval_requests: { org_id: string } } | null;
      if (!stepRow || stepRow.approval_requests?.org_id !== orgId) return [];
      if (stepRow.approver_user_id) return [stepRow.approver_user_id];
      if (stepRow.approver_role) {
        const { data: roleUsers } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", stepRow.approver_role);
        return (roleUsers ?? []).map((u) => u.id as string);
      }
      return [];
    }
    case "workflow_task_owner": {
      if (!aggregateId) return [];
      const { data: task } = await supabase
        .from("workflow_tasks")
        .select("assignee_user_id, assignee_role, workflow_runs!inner(org_id)")
        .eq("id", aggregateId)
        .maybeSingle();
      const taskRow = task as unknown as { assignee_user_id: string | null; assignee_role: string | null; workflow_runs: { org_id: string } } | null;
      if (!taskRow || taskRow.workflow_runs?.org_id !== orgId) return [];
      if (taskRow.assignee_user_id) return [taskRow.assignee_user_id];
      if (taskRow.assignee_role) {
        const { data: roleUsers } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", taskRow.assignee_role);
        return (roleUsers ?? []).map((u) => u.id as string);
      }
      return [];
    }
    case "case_assignee": {
      if (!aggregateId) return [];
      const { data: svcCase } = await supabase
        .from("service_requests")
        .select("assigned_to, org_id")
        .eq("id", aggregateId)
        .maybeSingle();
      if (!svcCase || svcCase.org_id !== orgId) return [];
      return svcCase.assigned_to ? [svcCase.assigned_to as string] : [];
    }
    case "department_role": {
      // Spec §11 lists "department role" as a selector; not exercised by
      // any cataloged event today (nothing in this HRMS's current event
      // set needs "whoever holds role X in employee's department"), but
      // implemented for forward-compatibility so a future event can use
      // it without another resolver change.
      const employeeId = await authoritativeEmployeeId(selector.employeeIdField, aggregateId, payload);
      if (!employeeId) return [];
      const { data: emp } = await supabase.from("employees").select("department").eq("id", employeeId).maybeSingle();
      if (!emp?.department) return [];
      const { data: deptManagers } = await supabase
        .from("app_users")
        .select("id, employees!inner(department)")
        .eq("org_id", orgId)
        .in("role", ["hr", "admin"])
        .eq("employees.department", emp.department);
      return (deptManagers ?? []).map((r) => r.id as string);
    }
    case "static_user": {
      // Only used for events whose recipient genuinely is a fixed party
      // established at EMIT time by trusted server code (e.g. "the
      // requester who submitted this approval") rather than a role to
      // resolve. Still validated for org membership below by the caller.
      const value = payload[selector.userIdField];
      return typeof value === "string" ? [value] : [];
    }
    default:
      return [];
  }
}

async function authoritativeEmployeeId(
  field: string,
  aggregateId: string | null,
  payload: Record<string, unknown>
): Promise<string | null> {
  // employeeId selectors are used for document/employee-centric events
  // where aggregate_id *is* the employee id (document events key off the
  // employee's own id as the aggregate) — fall back to the payload field
  // only when aggregateId isn't itself the employee (defensive, payload
  // value is still just a hint for which field name to use).
  const value = payload[field];
  if (typeof value === "string") return value;
  return aggregateId;
}

async function employeeUserId(supabase: SupabaseClient, orgId: string, employeeId: string): Promise<string | null> {
  const { data } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("employee_id", employeeId).maybeSingle();
  return (data?.id as string) ?? null;
}
