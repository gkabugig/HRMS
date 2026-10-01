import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

// Area 05 §8 "My Pay" — strictly self-scoped reads over the EXISTING
// payroll/payslips tables (no duplicate payroll data model — spec §17/§29).
// payslips_self_read RLS (0002/0017) already restricts every query here to
// the caller's own employee_id and only published payslips; employeeId is
// still passed and filtered on explicitly as defense in depth, matching the
// rest of this codebase's convention (RLS is the floor, not the only check).
export type MyPayslipRow = {
  id: string;
  period: string;
  gross: number;
  paye: number;
  nssf: number;
  shif: number;
  housingLevy: number;
  leaveDeduction: number;
  net: number;
  deductionCapped: boolean;
  publishedAt: string | null;
};

export async function getMyPayslips(supabase: SupabaseClient, employeeId: string): Promise<MyPayslipRow[]> {
  const { data, error } = await supabase
    .from("payslips")
    .select(
      "id, gross, paye, nssf, shif, housing_levy, leave_deduction, net, deduction_capped, published_at, payroll_runs(period)"
    )
    .eq("employee_id", employeeId)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    period: (p.payroll_runs as unknown as { period: string } | null)?.period ?? "",
    gross: p.gross,
    paye: p.paye,
    nssf: p.nssf,
    shif: p.shif,
    housingLevy: p.housing_levy,
    leaveDeduction: p.leave_deduction ?? 0,
    net: p.net,
    deductionCapped: p.deduction_capped ?? false,
    publishedAt: p.published_at,
  }));
}

export type MyPayslipDetail = MyPayslipRow & {
  otherDeductions: number;
  employeeName: string;
  staffNo: string;
  jobTitle: string;
  department: string;
};

// Secure single-payslip viewer (spec §8 "secure payslip viewer/download" +
// §14 "log sensitive payslip access/download where supported"). Re-derives
// the employeeId/payslip ownership from the live session's own RLS-scoped
// read rather than trusting a route param — a payslipId for someone else's
// payslip simply returns null here (RLS + the explicit eq(employee_id)
// below), satisfying the security acceptance test "Employee requests
// another employee's payslip -> denied; no metadata leakage".
export async function getMyPayslipDetail(
  supabase: SupabaseClient,
  params: { employeeId: string; payslipId: string; orgId: string; actorUserId: string }
): Promise<MyPayslipDetail | null> {
  const { employeeId, payslipId, orgId, actorUserId } = params;
  const { data, error } = await supabase
    .from("payslips")
    .select(
      "id, gross, paye, nssf, shif, housing_levy, leave_deduction, net, deduction_capped, other_deductions, published_at, payroll_runs(period), employees(name, staff_no, job_title, department)"
    )
    .eq("id", payslipId)
    .eq("employee_id", employeeId)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error || !data) return null;

  const employee = data.employees as unknown as { name: string; staff_no: string; job_title: string; department: string } | null;

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId,
    action: "payslip.viewed",
    resourceType: "payslip",
    resourceId: payslipId,
    eventCategory: "access",
    riskLevel: "elevated",
  }).catch(() => {});

  return {
    id: data.id,
    period: (data.payroll_runs as unknown as { period: string } | null)?.period ?? "",
    gross: data.gross,
    paye: data.paye,
    nssf: data.nssf,
    shif: data.shif,
    housingLevy: data.housing_levy,
    leaveDeduction: data.leave_deduction ?? 0,
    net: data.net,
    deductionCapped: data.deduction_capped ?? false,
    otherDeductions: data.other_deductions ?? 0,
    publishedAt: data.published_at,
    employeeName: employee?.name ?? "",
    staffNo: employee?.staff_no ?? "",
    jobTitle: employee?.job_title ?? "",
    department: employee?.department ?? "",
  };
}
