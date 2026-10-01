// Area 06 §14 "Team Requests" — service requests raised by the manager's
// direct reports. Relies on the new "service_requests_manager_team_read"
// RLS policy (migration 0075) added for this area — before that migration
// managers had an RBAC grant seeded but no matching RLS policy, so this
// query would have silently returned nothing.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ManagerServiceRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  createdAt: string;
  slaDueAt: string | null;
};

export async function getManagerRequests(supabase: SupabaseClient, employeeIds: string[]): Promise<ManagerServiceRequest[]> {
  if (employeeIds.length === 0) return [];

  const { data } = await supabase
    .from("service_requests")
    .select("id, employee_id, subject, description, priority, status, created_at, sla_due_at, employees(name)")
    .in("employee_id", employeeIds)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string;
    employee_id: string;
    subject: string;
    description: string | null;
    priority: string;
    status: string;
    created_at: string;
    sla_due_at: string | null;
    employees: { name: string } | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    employeeName: r.employees?.name ?? "—",
    subject: r.subject,
    description: r.description,
    priority: r.priority,
    status: r.status,
    createdAt: r.created_at,
    slaDueAt: r.sla_due_at,
  }));
}
