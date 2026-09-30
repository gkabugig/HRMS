// Payroll audit trail writer (spec §20). Every payroll-changing action in
// this module calls this after the change succeeds — never before, so a
// failed action doesn't leave a false audit trail.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logPayrollEvent(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    payrollRunId: string;
    actorId: string;
    eventType: string;
    entityType?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }
): Promise<void> {
  await supabase.from("payroll_audit_log").insert({
    org_id: input.orgId,
    payroll_run_id: input.payrollRunId,
    actor_id: input.actorId,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    old_value_json: input.oldValue ?? null,
    new_value_json: input.newValue ?? null,
    reason: input.reason ?? null,
  });
}
