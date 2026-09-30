// Payroll Exceptions Engine (spec §7). Runs after calculation, writes real
// findings to payroll_exceptions rather than computing them fresh on every
// page load, so a resolved/waived exception has a durable audit record.
// A few of the spec's listed exception types have no real signal in this
// schema (unexpected allowances, true duplicate identities — staff_no is
// already unique per org at the DB level) and are deliberately left out
// rather than invented; see the comments below for what each check
// actually reads.
import type { SupabaseClient } from "@supabase/supabase-js";

type NewException = {
  employee_id: string | null;
  exception_type: string;
  severity: "critical" | "warning" | "info";
  message: string;
};

export async function detectAndStoreExceptions(
  supabase: SupabaseClient,
  run: { id: string; orgId: string; period: string }
): Promise<void> {
  const found: NewException[] = [];

  const [
    { data: org },
    { data: payslips },
    { data: prevRun },
  ] = await Promise.all([
    supabase.from("organizations").select("payroll_variance_warning_pct").eq("id", run.orgId).maybeSingle(),
    supabase
      .from("payslips")
      .select("id, employee_id, gross, net")
      .eq("payroll_run_id", run.id),
    supabase
      .from("payroll_runs")
      .select("id")
      .eq("org_id", run.orgId)
      .lt("period", run.period)
      .order("period", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const employeeIds = (payslips ?? []).map((p) => p.employee_id);
  if (employeeIds.length === 0) {
    await replaceOpenAutoExceptions(supabase, run.id, found);
    return;
  }

  const thresholdPct = org?.payroll_variance_warning_pct ?? 15;

  const [
    { data: employees },
    { data: prevPayslips },
    { data: offboarding },
    { data: compChanges },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, status, date_of_hire, kra_pin, nssf_no, shif_no, bank_account_no")
      .in("id", employeeIds),
    prevRun
      ? supabase.from("payslips").select("employee_id, gross, net").eq("payroll_run_id", prevRun.id)
      : Promise.resolve({ data: [] as { employee_id: string; gross: number; net: number }[] }),
    supabase.from("offboarding_records").select("employee_id, last_working_day").in("employee_id", employeeIds),
    supabase
      .from("employee_compensation_history")
      .select("employee_id, effective_from, reason")
      .in("employee_id", employeeIds)
      .gte("effective_from", `${run.period}-01`)
      .lt("effective_from", nextMonthStart(run.period)),
  ]);

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const prevByEmployee = new Map((prevPayslips ?? []).map((p) => [p.employee_id, p]));
  const offboardingByEmployee = new Map((offboarding ?? []).map((o) => [o.employee_id, o.last_working_day]));
  const periodEnd = lastDayOfMonth(run.period);
  const periodStart = `${run.period}-01`;

  for (const slip of payslips ?? []) {
    const emp = employeeById.get(slip.employee_id);

    // Missing bank details (critical) — an included employee has no
    // account on file, so a payment can't actually be dispatched to them.
    if (!emp?.bank_account_no) {
      found.push({
        employee_id: slip.employee_id,
        exception_type: "missing_bank_details",
        severity: "critical",
        message: `${emp?.name ?? "Employee"} has no bank account on file.`,
      });
    }

    // Zero/negative net pay (critical).
    if (slip.net <= 0) {
      found.push({
        employee_id: slip.employee_id,
        exception_type: "zero_or_negative_net",
        severity: "critical",
        message: `${emp?.name ?? "Employee"}'s net pay is ${slip.net <= 0 ? "zero or negative" : "unusually low"} (KES ${slip.net.toLocaleString()}).`,
      });
    }

    // Large gross/net variance vs the previous run (warning) — threshold
    // is the org's own payroll_variance_warning_pct, never hard-coded.
    const prev = prevByEmployee.get(slip.employee_id);
    if (prev && prev.gross > 0) {
      const grossPct = ((slip.gross - prev.gross) / prev.gross) * 100;
      if (Math.abs(grossPct) >= thresholdPct) {
        found.push({
          employee_id: slip.employee_id,
          exception_type: "large_gross_variance",
          severity: "warning",
          message: `${emp?.name ?? "Employee"}'s gross pay moved ${grossPct > 0 ? "up" : "down"} ${Math.abs(Math.round(grossPct * 10) / 10)}% vs the previous run.`,
        });
      }
    }

    // Missing statutory identifiers (warning).
    if (!emp?.kra_pin || !emp?.nssf_no || !emp?.shif_no) {
      const missing = [!emp?.kra_pin && "KRA PIN", !emp?.nssf_no && "NSSF no.", !emp?.shif_no && "SHIF no."].filter(Boolean).join(", ");
      found.push({
        employee_id: slip.employee_id,
        exception_type: "missing_statutory_identifier",
        severity: "warning",
        message: `${emp?.name ?? "Employee"} is missing: ${missing}.`,
      });
    }

    // Inactive employee included (critical) — status now Terminated but a
    // payslip exists on this run.
    if (emp && emp.status !== "Active") {
      found.push({
        employee_id: slip.employee_id,
        exception_type: "inactive_employee_included",
        severity: "critical",
        message: `${emp.name} is included in this run but is no longer Active.`,
      });
    }

    // New hire before start date (warning).
    if (emp?.date_of_hire && emp.date_of_hire > periodEnd) {
      found.push({
        employee_id: slip.employee_id,
        exception_type: "new_hire_before_start",
        severity: "warning",
        message: `${emp.name}'s hire date (${emp.date_of_hire}) is after this payroll period.`,
      });
    }

    // Exit after termination (warning) — offboarded with a last working
    // day before this period, but still included.
    const lastWorkingDay = offboardingByEmployee.get(slip.employee_id);
    if (lastWorkingDay && lastWorkingDay < periodStart) {
      found.push({
        employee_id: slip.employee_id,
        exception_type: "exit_after_termination",
        severity: "warning",
        message: `${emp?.name ?? "Employee"}'s last working day (${lastWorkingDay}) was before this payroll period.`,
      });
    }
  }

  // Unapproved salary change (warning) — a compensation change effective
  // this period with no reason on file.
  for (const c of compChanges ?? []) {
    if (!c.reason || !c.reason.trim()) {
      const emp = employeeById.get(c.employee_id);
      found.push({
        employee_id: c.employee_id,
        exception_type: "unapproved_salary_change",
        severity: "critical",
        message: `${emp?.name ?? "Employee"}'s salary changed this period with no reason recorded.`,
      });
    }
  }

  // Missing payslip (critical) — currently-active employees with no
  // payslip on this run. Best-effort: employee status is read as of now,
  // not as of the run's period, since the app doesn't keep a historical
  // active/inactive snapshot.
  const { data: activeEmployees } = await supabase.from("employees").select("id, name").eq("org_id", run.orgId).eq("status", "Active");
  const coveredIds = new Set(employeeIds);
  for (const e of activeEmployees ?? []) {
    if (!coveredIds.has(e.id)) {
      found.push({
        employee_id: e.id,
        exception_type: "missing_payslip",
        severity: "critical",
        message: `${e.name} is Active but has no payslip on this run.`,
      });
    }
  }

  await replaceOpenAutoExceptions(supabase, run.id, found);
}

async function replaceOpenAutoExceptions(supabase: SupabaseClient, runId: string, found: NewException[]): Promise<void> {
  await supabase.from("payroll_exceptions").delete().eq("payroll_run_id", runId).eq("source", "auto").eq("status", "open");
  if (found.length === 0) return;
  await supabase.from("payroll_exceptions").insert(
    found.map((f) => ({
      payroll_run_id: runId,
      employee_id: f.employee_id,
      exception_type: f.exception_type,
      severity: f.severity,
      message: f.message,
      source: "auto" as const,
    }))
  );
}

function lastDayOfMonth(period: string): string {
  const d = new Date(`${period}-01`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function nextMonthStart(period: string): string {
  const d = new Date(`${period}-01`);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
