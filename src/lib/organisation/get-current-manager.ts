import type { SupabaseClient } from "@supabase/supabase-js";

// Area 04 §12 — the authoritative resolver for "who is this employee's
// current line manager", backed by get_current_manager_id()
// (supabase/migrations/0056), which reads reporting_relationships directly
// (relationship_type='line_manager', is_primary, effective-dated) rather
// than employees.reporting_manager_id. SECURITY DEFINER so it works the
// same regardless of the caller's own row-level visibility into
// reporting_relationships (which, unlike organisation_units/positions, is
// restricted to self/manager/hr — see 0023_phase2_foundation.sql) — this is
// meant to be the one place every module (RBAC, Workflow, UI) asks the
// question, not a raw table read.
//
// Takes an explicit asOf date (defaulting to today) because Area 03
// workflow/escalation logic and historical reporting both need to resolve
// "who was the manager on this date", not only "who is it right now" — see
// the spec's Employee Data Change example (§4: a transfer on 2026-10-01
// means a report run for 2026-09-15 must still resolve the old manager).
export async function getCurrentManager(
  supabase: SupabaseClient,
  employeeId: string,
  asOf: Date = new Date()
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_current_manager_id", {
    p_employee_id: employeeId,
    p_as_of: asOf.toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
