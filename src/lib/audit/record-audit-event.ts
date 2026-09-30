import type { SupabaseClient } from "@supabase/supabase-js";

// Org-wide audit trail (Phase 2 spec Part 1, Audit Centre). Distinct from
// the narrower employee_audit_log (field-level diffs on the Employees
// screen only, kept as-is) and payroll_audit_log (payroll-run-scoped) —
// audit_events is the cross-module log: any action, on any resource, by
// any actor, in any of the eight event categories the spec defines.
// Append-only by construction (no update/delete RLS policy exists at all),
// so this insert is the only way a row is ever written.
export type AuditEventCategory =
  | "authentication"
  | "access"
  | "data"
  | "workflow"
  | "approval"
  | "security"
  | "export"
  | "configuration";

export type AuditRiskLevel = "normal" | "elevated" | "high";

export async function recordAuditEvent(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    actorUserId?: string | null;
    actorRole?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    eventCategory: AuditEventCategory;
    riskLevel?: AuditRiskLevel;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
): Promise<void> {
  await supabase.from("audit_events").insert({
    org_id: input.orgId,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole ?? null,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    event_category: input.eventCategory,
    risk_level: input.riskLevel ?? "normal",
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    metadata_json: input.metadata ?? null,
  });
}
