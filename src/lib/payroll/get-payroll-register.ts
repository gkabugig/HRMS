// Employee Payroll Register (spec §16) — server-side pagination, filtering
// and sorting, per the spec's explicit instruction not to load the whole
// payroll population into the browser.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollRegisterRow } from "./command-centre-types";

const PAGE_SIZE = 25;

export async function getPayrollRegister(
  supabase: SupabaseClient,
  runId: string,
  opts: { page?: number; search?: string; department?: string; status?: "Ready" | "Exception" },
  canSeeSalary: boolean
): Promise<{ rows: PayrollRegisterRow[]; total: number; page: number; pageSize: number; departments: string[] }> {
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [{ data: payslips }, { data: exceptionEmployeeIds }, { data: adjustments }] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, employee_id, gross, net, paye, nssf, shif, housing_levy, other_deductions, employees(name, staff_no, department, basic, house_allowance, transport_allowance, other_allowance)")
      .eq("payroll_run_id", runId),
    supabase.from("payroll_exceptions").select("employee_id").eq("payroll_run_id", runId).eq("status", "open"),
    supabase.from("payroll_adjustments").select("employee_id, amount").eq("payroll_run_id", runId),
  ]);

  const exceptionSet = new Set((exceptionEmployeeIds ?? []).map((e) => e.employee_id).filter(Boolean));
  const adjustmentByEmployee = new Map<string, number>();
  for (const a of adjustments ?? []) {
    adjustmentByEmployee.set(a.employee_id, (adjustmentByEmployee.get(a.employee_id) ?? 0) + Number(a.amount));
  }

  let rows: PayrollRegisterRow[] = (payslips ?? []).map((p) => {
    const emp = p.employees as unknown as {
      name: string;
      staff_no: string;
      department: string;
      basic: number;
      house_allowance: number;
      transport_allowance: number;
      other_allowance: number;
    } | null;
    const allowances = (emp?.house_allowance ?? 0) + (emp?.transport_allowance ?? 0) + (emp?.other_allowance ?? 0);
    const adjustment = adjustmentByEmployee.get(p.employee_id) ?? 0;
    return {
      id: p.employee_id,
      name: emp?.name ?? "—",
      staffNo: emp?.staff_no ?? "—",
      department: emp?.department ?? "—",
      basic: emp?.basic ?? 0,
      allowances,
      gross: Number(p.gross),
      paye: canSeeSalary ? Number(p.paye) : null,
      nssf: canSeeSalary ? Number(p.nssf) : null,
      shif: canSeeSalary ? Number(p.shif) : null,
      housingLevy: canSeeSalary ? Number(p.housing_levy) : null,
      otherDeductions: canSeeSalary ? Number(p.other_deductions) : null,
      net: Number(p.net),
      netAdjusted: Number(p.net) + adjustment,
      variancePct: null,
      status: exceptionSet.has(p.employee_id) ? "Exception" : "Ready",
    };
  });

  const departments = [...new Set(rows.map((r) => r.department))].sort();

  if (opts.search) {
    const q = opts.search.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.staffNo.toLowerCase().includes(q));
  }
  if (opts.department) rows = rows.filter((r) => r.department === opts.department);
  if (opts.status) rows = rows.filter((r) => r.status === opts.status);

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const total = rows.length;
  const paged = rows.slice(from, to + 1);

  return { rows: paged, total, page, pageSize: PAGE_SIZE, departments };
}
