// Shared helper for writing to employee_audit_log. Pure-ish (takes a
// Supabase client) so it can be called from any Server Action that changes
// an employee record, without duplicating the diff-and-insert logic.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logEmployeeChanges(
  supabase: SupabaseClient,
  employeeId: string,
  changedBy: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  const rows = Object.keys(after)
    .filter((field) => String(before[field] ?? "") !== String(after[field] ?? ""))
    .map((field) => ({
      employee_id: employeeId,
      changed_by: changedBy,
      field,
      old_value: before[field] === null || before[field] === undefined ? null : String(before[field]),
      new_value: after[field] === null || after[field] === undefined ? null : String(after[field]),
    }));

  if (rows.length === 0) return;
  await supabase.from("employee_audit_log").insert(rows);
}
