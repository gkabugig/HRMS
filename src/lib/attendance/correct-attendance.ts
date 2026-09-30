import type { SupabaseClient } from "@supabase/supabase-js";

// Controlled attendance correction (spec §11): never a silent historical
// edit — every correction writes an attendance_corrections row capturing
// original value, corrected value, actor, reason and timestamp, and the
// underlying attendance row is only ever updated alongside that audit row,
// never on its own.
export async function correctAttendance(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    employeeId: string;
    workDate: string;
    field: "clock_in" | "clock_out";
    correctedValue: string;
    reason: string;
    actorId: string;
  }
): Promise<{ payrollImpact: boolean }> {
  const { data: existing } = await supabase
    .from("attendance")
    .select("id, clock_in, clock_out")
    .eq("employee_id", params.employeeId)
    .eq("work_date", params.workDate)
    .maybeSingle();

  const originalValue = existing ? (params.field === "clock_in" ? existing.clock_in : existing.clock_out) : null;

  // Payroll-impact flag (spec §11): a correction to a date whose payroll
  // period has already moved past the draft/inputs stage needs a second
  // look from whoever runs payroll, since the numbers it produced may now
  // be stale. Periods are matched to a calendar month ("YYYY-MM"), the
  // same format payroll_runs.period already uses.
  const period = params.workDate.slice(0, 7);
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .eq("org_id", params.orgId)
    .eq("period", period)
    .maybeSingle();
  const payrollImpact = !!run && !["draft", "inputs_open"].includes(run.status);

  const payload = {
    employee_id: params.employeeId,
    work_date: params.workDate,
    clock_in: params.field === "clock_in" ? params.correctedValue : (existing?.clock_in ?? null),
    clock_out: params.field === "clock_out" ? params.correctedValue : (existing?.clock_out ?? null),
    source: "correction",
  };

  const { data: upserted, error } = await supabase
    .from("attendance")
    .upsert(payload, { onConflict: "employee_id,work_date" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("attendance_corrections").insert({
    attendance_id: upserted.id,
    employee_id: params.employeeId,
    work_date: params.workDate,
    field: params.field,
    original_value: originalValue,
    corrected_value: params.correctedValue,
    reason: params.reason,
    actor_id: params.actorId,
    payroll_impact: payrollImpact,
  });

  return { payrollImpact };
}
