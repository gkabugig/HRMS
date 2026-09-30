"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { calculatePayrollRun } from "@/lib/payroll/run-calculation";
import { detectAndStoreExceptions } from "@/lib/payroll/exceptions-engine";
import { logPayrollEvent } from "@/lib/payroll/audit";
import { assertTransition, type PayrollStatus } from "@/lib/payroll/state-machine";

type AuthedRun = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  orgId: string;
  role: string;
  run: { id: string; org_id: string; period: string; status: PayrollStatus; locked: boolean };
};

async function requireManager(runId: string): Promise<AuthedRun> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) {
    throw new Error("Not authorised to manage payroll.");
  }

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, org_id, period, status, locked")
    .eq("id", runId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();
  if (!run) throw new Error("Payroll run not found.");

  return { supabase, userId: user.id, orgId: appUser.org_id, role: appUser.role, run: run as AuthedRun["run"] };
}

function revalidateRun(runId: string) {
  revalidatePath(`/dashboard/payroll/${runId}`);
  revalidatePath("/dashboard/payroll");
}

// draft/inputs_open -> calculated: runs the (unchanged) calculation engine,
// then refreshes the exception list against the new results.
export async function calculateRun(formData: FormData) {
  const runId = String(formData.get("run_id"));
  const { supabase, userId, orgId, role, run } = await requireManager(runId);
  if (run.locked) throw new Error("This payroll period is locked.");

  const fromStatus = run.status;
  // draft -> inputs_open -> calculated happen together here since this app
  // has no separate input-entry screen yet (spec §6's checklist is shown
  // read-only in the Payroll Health panel instead of gating a distinct UI
  // step) — recorded as a single transition to "calculated" either way.
  assertTransition(fromStatus === "draft" ? "inputs_open" : fromStatus, "calculated", role);

  const { payslipCount } = await calculatePayrollRun(supabase, run.id, orgId, run.period);
  await detectAndStoreExceptions(supabase, { id: run.id, orgId, period: run.period });

  await supabase.from("payroll_runs").update({ status: "calculated" }).eq("id", run.id);
  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: "payroll_calculated",
    oldValue: { status: fromStatus },
    newValue: { status: "calculated", payslip_count: payslipCount },
  });

  revalidateRun(run.id);
}

// Generic guarded transition for the remaining stages (calculated ->
// under_review, under_review -> approved, approved -> processed, processed
// -> paid, paid -> closed). Approval is blocked while critical exceptions
// are still open (spec §15).
export async function transitionRun(formData: FormData) {
  const runId = String(formData.get("run_id"));
  const to = String(formData.get("to")) as PayrollStatus;
  const comment = String(formData.get("comment") || "").trim() || null;

  const { supabase, userId, orgId, role, run } = await requireManager(runId);
  if (run.locked) throw new Error("This payroll period is locked.");

  assertTransition(run.status, to, role);

  if (to === "approved") {
    const { count: openCritical } = await supabase
      .from("payroll_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("payroll_run_id", run.id)
      .eq("status", "open")
      .eq("severity", "critical");
    if ((openCritical ?? 0) > 0) {
      throw new Error("Cannot approve while critical exceptions are open. Resolve or waive them first.");
    }
  }

  const updates: Record<string, unknown> = { status: to };
  if (to === "closed") updates.locked = true;
  await supabase.from("payroll_runs").update(updates).eq("id", run.id);

  if (["under_review", "approved", "processed", "paid", "closed"].includes(to)) {
    await supabase.from("payroll_approvals").insert({
      payroll_run_id: run.id,
      stage: to,
      approver_id: userId,
      decision: "approved",
      comment,
    });
  }

  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: `payroll_${to}`,
    oldValue: { status: run.status },
    newValue: { status: to },
    reason: comment ?? undefined,
  });

  revalidateRun(run.id);
}

export async function resolveException(formData: FormData) {
  const exceptionId = String(formData.get("exception_id"));
  const runId = String(formData.get("run_id"));
  const note = String(formData.get("note") || "").trim();
  const { supabase, userId, orgId, run } = await requireManager(runId);

  const { error } = await supabase
    .from("payroll_exceptions")
    .update({ status: "resolved", resolved_by: userId, resolved_at: new Date().toISOString(), resolution_note: note || null })
    .eq("id", exceptionId)
    .eq("payroll_run_id", run.id);
  if (error) throw new Error(error.message);

  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: "exception_resolved",
    entityType: "payroll_exception",
    entityId: exceptionId,
    reason: note || undefined,
  });

  revalidateRun(run.id);
}

// Waiving requires a reason (spec: "Approver should be required to confirm
// unresolved warnings or have them waived with a reason").
export async function waiveException(formData: FormData) {
  const exceptionId = String(formData.get("exception_id"));
  const runId = String(formData.get("run_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A reason is required to waive an exception.");

  const { supabase, userId, orgId, run } = await requireManager(runId);

  const { error } = await supabase
    .from("payroll_exceptions")
    .update({ status: "waived", resolved_by: userId, resolved_at: new Date().toISOString(), resolution_note: reason })
    .eq("id", exceptionId)
    .eq("payroll_run_id", run.id);
  if (error) throw new Error(error.message);

  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: "exception_waived",
    entityType: "payroll_exception",
    entityId: exceptionId,
    reason,
  });

  revalidateRun(run.id);
}

export async function addAdjustment(formData: FormData) {
  const runId = String(formData.get("run_id"));
  const employeeId = String(formData.get("employee_id"));
  const adjustmentType = String(formData.get("adjustment_type") || "Correction");
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A reason is required for a payroll adjustment.");
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter a non-zero adjustment amount.");

  const { supabase, userId, orgId, run } = await requireManager(runId);
  if (run.locked) throw new Error("This payroll period is locked; use the correction process for a closed period.");

  const { data: adj, error } = await supabase
    .from("payroll_adjustments")
    .insert({ payroll_run_id: run.id, employee_id: employeeId, adjustment_type: adjustmentType, amount, reason, approved_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: "adjustment_added",
    entityType: "payroll_adjustment",
    entityId: adj.id,
    newValue: { employee_id: employeeId, adjustment_type: adjustmentType, amount },
    reason,
  });

  revalidateRun(run.id);
}

// Publish this run's payslips to employee self-service. Gated to
// approved-or-later (spec §18) so nobody sees a number before it's signed
// off.
export async function publishPayslips(formData: FormData) {
  const runId = String(formData.get("run_id"));
  const { supabase, userId, orgId, run } = await requireManager(runId);

  const eligible: PayrollStatus[] = ["approved", "processed", "paid", "closed"];
  if (!eligible.includes(run.status)) {
    throw new Error("Payroll must be approved before payslips can be published.");
  }

  const { data, error } = await supabase
    .from("payslips")
    .update({ published_at: new Date().toISOString() })
    .eq("payroll_run_id", run.id)
    .is("published_at", null)
    .select("id");
  if (error) throw new Error(error.message);

  await logPayrollEvent(supabase, {
    orgId,
    payrollRunId: run.id,
    actorId: userId,
    eventType: "payslips_published",
    newValue: { count: (data ?? []).length },
  });

  revalidateRun(run.id);
}
