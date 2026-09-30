// Employee 360 acceptance tests #11/#12: a salary or job/department/manager
// change must create a history record without destroying the old one.
// Called from the Employees edit action after a successful update, using
// the same before/after shape that action already builds for the audit log.
// Not a "use server" file — these are plain helpers, called from one.
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordJobHistoryChange(
  supabase: AnyClient,
  employeeId: string,
  before: { department: string; job_title: string; employment_type: string; reporting_manager_id: string | null },
  after: { department: string; job_title: string; employment_type: string; reporting_manager_id: string | null },
  reason = "Updated from Employees page"
) {
  const changed =
    before.department !== after.department ||
    before.job_title !== after.job_title ||
    before.employment_type !== after.employment_type ||
    before.reporting_manager_id !== after.reporting_manager_id;
  if (!changed) return;

  // Close out whatever history row is still open (effective_to null).
  await supabase
    .from("employee_job_history")
    .update({ effective_to: today() })
    .eq("employee_id", employeeId)
    .is("effective_to", null);

  await supabase.from("employee_job_history").insert({
    employee_id: employeeId,
    effective_from: today(),
    department: after.department,
    job_title: after.job_title,
    employment_type: after.employment_type,
    manager_id: after.reporting_manager_id,
    reason,
  });
}

export async function recordCompensationHistoryChange(
  supabase: AnyClient,
  employeeId: string,
  approvedBy: string | null,
  before: { basic: number; house_allowance: number; transport_allowance: number; other_allowance: number },
  after: { basic: number; house_allowance: number; transport_allowance: number; other_allowance: number },
  reason = "Updated from Employees page"
) {
  const changed =
    Number(before.basic) !== Number(after.basic) ||
    Number(before.house_allowance) !== Number(after.house_allowance) ||
    Number(before.transport_allowance) !== Number(after.transport_allowance) ||
    Number(before.other_allowance) !== Number(after.other_allowance);
  if (!changed) return;

  await supabase
    .from("employee_compensation_history")
    .update({ effective_to: today() })
    .eq("employee_id", employeeId)
    .is("effective_to", null);

  await supabase.from("employee_compensation_history").insert({
    employee_id: employeeId,
    effective_from: today(),
    basic: after.basic,
    house_allowance: after.house_allowance,
    transport_allowance: after.transport_allowance,
    other_allowance: after.other_allowance,
    reason,
    approved_by: approvedBy,
  });
}
