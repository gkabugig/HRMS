"use server";

// Only the "prepare a new payroll period" action lives here now — every
// other payroll action (calculate, review, approve, exceptions,
// adjustments, outputs) lives under [payrollRunId]/actions.ts since it
// needs a specific run. The old single-step "Run payroll" flow (create +
// calculate in one click) is replaced by the Payroll Command Centre's
// Draft → Calculated workflow; the calculation logic itself is unchanged,
// just moved to lib/payroll/run-calculation.ts so both the new "Calculate"
// action and this file's nothing-left-here can share it if ever needed.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logPayrollEvent } from "@/lib/payroll/audit";

export async function prepareDraftRun(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user!.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) {
    throw new Error("Not authorised to prepare payroll.");
  }

  const period = String(formData.get("period")); // 'YYYY-MM'

  const { data: run, error } = await supabase
    .from("payroll_runs")
    .insert({ org_id: appUser.org_id, period, generated_by: user!.id, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logPayrollEvent(supabase, {
    orgId: appUser.org_id,
    payrollRunId: run.id,
    actorId: user!.id,
    eventType: "payroll_created",
  });

  redirect(`/dashboard/payroll/${run.id}`);
}
