// Server-side data loading for the reports. Reads through the signed-in
// user's own session, so row-level security still decides what they can see
// (a manager only ever gets their own team's rows).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAttendance, buildCompliance, buildDisciplinary, buildDiversity, buildHeadcount, buildLeave,
  buildPayroll, buildPayrollByDepartment, buildRecruitment, buildStatutory, buildTraining, buildTurnover,
} from "./builders";
import { clampRange } from "./filters";
import { findReport } from "./catalogue";
import type {
  AttendanceRow, CandidateRow, ComplianceRow, DisciplinaryRow, EmployeeRow, EnrollmentRow, HistoryRow,
  LeaveRow, OffboardingRow, PayslipRow, ReportFilters, ReportResult, RequisitionRow,
} from "./types";

// Supabase returns at most 1000 rows per request, so large tables are read in pages.
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build(page * size, page * size + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

const num = (v: unknown) => Number(v ?? 0);

async function loadEmployees(s: SupabaseClient, orgId: string): Promise<EmployeeRow[]> {
  const rows = await fetchAll<Record<string, unknown>>((a, b) =>
    s.from("employees")
      .select("id, staff_no, name, department, job_title, employment_type, date_of_hire, status, gender, date_of_birth, basic")
      .eq("org_id", orgId).order("id").range(a, b)
  );
  return rows.map((r) => ({ ...(r as unknown as EmployeeRow), basic: num(r.basic) }));
}

async function loadPayslips(s: SupabaseClient, f: ReportFilters): Promise<PayslipRow[]> {
  const rows = await fetchAll<Record<string, unknown>>((a, b) =>
    s.from("payslips")
      .select("id, employee_id, gross, nssf, shif, housing_levy, paye, other_deductions, net, employer_nssf, employer_housing_levy, payroll_runs!inner(period, status)")
      .gte("payroll_runs.period", f.from.slice(0, 7))
      .lte("payroll_runs.period", f.to.slice(0, 7))
      .not("payroll_runs.status", "in", "(draft,inputs_open)")
      .order("id").range(a, b)
  );
  return rows.map((r) => {
    const run = r.payroll_runs as { period: string } | { period: string }[];
    return {
      period: (Array.isArray(run) ? run[0] : run).period,
      employee_id: r.employee_id as string,
      gross: num(r.gross), nssf: num(r.nssf), shif: num(r.shif), housing_levy: num(r.housing_levy), paye: num(r.paye),
      other_deductions: num(r.other_deductions), net: num(r.net), employer_nssf: num(r.employer_nssf), employer_housing_levy: num(r.employer_housing_levy),
    };
  });
}

export async function runReport(
  s: SupabaseClient, orgId: string, key: string, filtersIn: ReportFilters, today: string
): Promise<ReportResult> {
  const def = findReport(key);
  if (!def) throw new Error("Unknown report.");
  let f = filtersIn;
  let clampNote: string | null = null;
  if (def.maxDays) {
    const c = clampRange(f, def.maxDays);
    f = c.filters;
    if (c.clamped) clampNote = `This report covers at most ${def.maxDays} days, so it starts on ${f.from}.`;
  }

  const employees = await loadEmployees(s, orgId);
  let result: ReportResult;

  switch (key) {
    case "headcount":
      result = buildHeadcount(employees, f, today);
      break;
    case "diversity":
      result = buildDiversity(employees, f, today);
      break;
    case "turnover": {
      const off = await fetchAll<OffboardingRow>((a, b) =>
        s.from("offboarding_records").select("id, employee_id, exit_type, notice_date, last_working_day, exit_interview_completed, severance_pay").order("id").range(a, b)
      );
      result = buildTurnover(employees, off.map((o) => ({ ...o, severance_pay: o.severance_pay === null ? null : num(o.severance_pay) })), f);
      break;
    }
    case "attendance": {
      const [attendance, leave, hol] = await Promise.all([
        fetchAll<AttendanceRow>((a, b) =>
          s.from("attendance").select("id, employee_id, work_date, clock_in, clock_out").gte("work_date", f.from).lte("work_date", f.to).order("id").range(a, b)
        ),
        fetchAll<LeaveRow>((a, b) =>
          s.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, days, status").eq("status", "Approved").lte("start_date", f.to).gte("end_date", f.from).order("id").range(a, b)
        ),
        s.from("public_holidays").select("holiday_date").eq("org_id", orgId).gte("holiday_date", f.from).lte("holiday_date", f.to),
      ]);
      result = buildAttendance(employees, attendance, leave, new Set((hol.data ?? []).map((h) => h.holiday_date as string)), f, today);
      break;
    }
    case "leave": {
      const year = f.to.slice(0, 4);
      const [requests, pol] = await Promise.all([
        fetchAll<LeaveRow>((a, b) =>
          s.from("leave_requests").select("id, employee_id, leave_type, start_date, end_date, days, status").gte("start_date", `${year}-01-01`).lte("start_date", `${year}-12-31`).order("id").range(a, b)
        ),
        s.from("leave_policies").select("leave_type, annual_entitlement_days").eq("org_id", orgId),
      ]);
      const ent: Record<string, number> = {};
      for (const p of pol.data ?? []) ent[p.leave_type as string] = num(p.annual_entitlement_days);
      result = buildLeave(employees, ent, requests, f);
      break;
    }
    case "payroll":
      result = buildPayroll(employees, await loadPayslips(s, f), f);
      break;
    case "payroll-department":
      result = buildPayrollByDepartment(employees, await loadPayslips(s, f), f);
      break;
    case "statutory":
      result = buildStatutory(employees, await loadPayslips(s, f), f);
      break;
    case "compliance": {
      const docs = await fetchAll<ComplianceRow>((a, b) =>
        s.from("compliance_documents").select("id, employee_id, doc_type, label, expiry_date, alert_threshold_days").eq("org_id", orgId).order("id").range(a, b)
      );
      result = buildCompliance(employees, docs, f, today);
      break;
    }
    case "training": {
      const rows = await fetchAll<Record<string, unknown>>((a, b) =>
        s.from("training_enrollments").select("id, employee_id, status, enrolled_on, completed_on, training_courses(name, mandatory, cost)").order("id").range(a, b)
      );
      const enrol: EnrollmentRow[] = rows.map((r) => {
        const c = r.training_courses as { name: string; mandatory: boolean; cost: number | null } | { name: string; mandatory: boolean; cost: number | null }[] | null;
        const course = Array.isArray(c) ? c[0] : c;
        return {
          employee_id: r.employee_id as string, course_name: course?.name ?? "—", mandatory: !!course?.mandatory, cost: num(course?.cost),
          status: r.status as string, enrolled_on: r.enrolled_on as string, completed_on: (r.completed_on as string | null) ?? null,
        };
      });
      result = buildTraining(employees, enrol, f);
      break;
    }
    case "disciplinary": {
      const rows = await fetchAll<DisciplinaryRow>((a, b) =>
        s.from("disciplinary_actions").select("id, employee_id, hearing_date, action_type, reason, outcome").order("id").range(a, b)
      );
      result = buildDisciplinary(employees, rows, f);
      break;
    }
    case "recruitment": {
      const [reqs, cands, hist] = await Promise.all([
        fetchAll<RequisitionRow>((a, b) =>
          s.from("requisitions").select("id, role, department, headcount, status, approval_status, raised_on").eq("org_id", orgId).order("id").range(a, b)
        ),
        fetchAll<CandidateRow>((a, b) =>
          s.from("candidates").select("id, requisition_id, source, stage, rejection_reason, added_on").order("id").range(a, b)
        ),
        fetchAll<HistoryRow>((a, b) =>
          s.from("candidate_stage_history").select("id, candidate_id, to_stage, changed_at").order("id").range(a, b)
        ),
      ]);
      result = buildRecruitment(reqs, cands, hist, f, today);
      break;
    }
    default:
      throw new Error("Unknown report.");
  }

  if (clampNote) result.notes.unshift(clampNote);
  return result;
}
