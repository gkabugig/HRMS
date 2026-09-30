import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEventCategory, AuditRiskLevel } from "./record-audit-event";

export type { AuditEventCategory, AuditRiskLevel } from "./record-audit-event";

export type AuditEventRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  event_category: AuditEventCategory;
  risk_level: AuditRiskLevel;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  actor_name: string | null;
};

export type AuditTrailFilters = {
  dateFrom?: string;
  dateTo?: string;
  actorUserId?: string;
  eventCategory?: AuditEventCategory;
  resourceType?: string;
  riskLevel?: AuditRiskLevel;
  q?: string; // matches against action/resource_type
};

// RLS (audit_events_hr_read) already limits this to admin/hr of the
// caller's own org, so callers don't need to re-check role here — this is
// just the query-builder + actor-name join used by the Audit Centre page.
export async function getAuditTrail(
  supabase: SupabaseClient,
  filters: AuditTrailFilters = {},
  limit = 200
): Promise<AuditEventRow[]> {
  let query = supabase
    .from("audit_events")
    .select("*, app_users(employee_id, employees(name))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
  if (filters.eventCategory) query = query.eq("event_category", filters.eventCategory);
  if (filters.resourceType) query = query.eq("resource_type", filters.resourceType);
  if (filters.riskLevel) query = query.eq("risk_level", filters.riskLevel);
  if (filters.q) query = query.or(`action.ilike.%${filters.q}%,resource_type.ilike.%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const appUser = row.app_users as unknown as { employee_id: string | null; employees: { name: string } | null } | null;
    return {
      id: row.id,
      created_at: row.created_at,
      actor_user_id: row.actor_user_id,
      actor_role: row.actor_role,
      action: row.action,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      event_category: row.event_category,
      risk_level: row.risk_level,
      before_json: row.before_json,
      after_json: row.after_json,
      metadata_json: row.metadata_json,
      actor_name: appUser?.employees?.name ?? null,
    };
  });
}

// Distinct resource types seen so far, for the filter dropdown — cheap
// enough to compute client-side from the same 200-row window rather than a
// separate query; the Audit Centre isn't trying to be a full-text search
// over unbounded history in this pass.
export function distinctResourceTypes(rows: AuditEventRow[]): string[] {
  return [...new Set(rows.map((r) => r.resource_type))].sort();
}
