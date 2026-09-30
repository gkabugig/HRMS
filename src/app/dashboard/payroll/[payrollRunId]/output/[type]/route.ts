// Payment & Outputs Centre (spec §19): bank file, payroll register and
// statutory summary exports, treated as high-risk outputs — checksum'd,
// audited (who generated it, when) and recorded in payroll_outputs so the
// Output Centre panel has a real history rather than a "download" button
// with no trace.
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { csvResponse, toCsv } from "@/lib/reports";
import { logPayrollEvent } from "@/lib/payroll/audit";
import type { PayrollStatus } from "@/lib/payroll/state-machine";

const OUTPUT_TYPES = ["bank_file", "payroll_register", "statutory_summary"] as const;
type OutputType = (typeof OUTPUT_TYPES)[number];

export async function GET(_request: Request, { params }: { params: Promise<{ payrollRunId: string; type: string }> }) {
  const { payrollRunId, type } = await params;
  if (!OUTPUT_TYPES.includes(type as OutputType)) {
    return new Response("Unknown output type.", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) {
    return new Response("Not authorised.", { status: 403 });
  }

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period, status")
    .eq("id", payrollRunId)
    .eq("org_id", appUser.org_id)
    .maybeSingle();
  if (!run) return new Response("Payroll run not found.", { status: 404 });

  // Bank file is a payment instrument — spec §19: "only approved/locked
  // payroll can generate final payment file."
  const status = run.status as PayrollStatus;
  if (type === "bank_file" && !["approved", "processed", "paid", "closed"].includes(status)) {
    return new Response("Payroll must be approved before a bank file can be generated.", { status: 409 });
  }

  const { data: payslips } = await supabase
    .from("payslips")
    .select("employee_id, gross, net, paye, nssf, shif, housing_levy, other_deductions, employees(name, staff_no, department, bank_name, bank_account_no, bank_branch_code)")
    .eq("payroll_run_id", run.id);

  let filename: string;
  let rows: Record<string, string | number | null>[];

  if (type === "bank_file") {
    filename = `bank-file-${run.period}.csv`;
    rows = (payslips ?? []).map((p) => {
      const emp = p.employees as unknown as { name: string; staff_no: string; bank_name: string | null; bank_account_no: string | null; bank_branch_code: string | null } | null;
      return {
        staff_no: emp?.staff_no ?? "",
        name: emp?.name ?? "",
        bank_name: emp?.bank_name ?? "",
        account_no: emp?.bank_account_no ?? "",
        branch_code: emp?.bank_branch_code ?? "",
        amount: Number(p.net),
      };
    });
  } else if (type === "statutory_summary") {
    filename = `statutory-summary-${run.period}.csv`;
    const totals = { PAYE: 0, NSSF: 0, SHIF: 0, HOUSING_LEVY: 0 };
    for (const p of payslips ?? []) {
      totals.PAYE += Number(p.paye);
      totals.NSSF += Number(p.nssf);
      totals.SHIF += Number(p.shif);
      totals.HOUSING_LEVY += Number(p.housing_levy);
    }
    rows = Object.entries(totals).map(([component, amount]) => ({ period: run.period, component, amount }));
  } else {
    filename = `payroll-register-${run.period}.csv`;
    rows = (payslips ?? []).map((p) => {
      const emp = p.employees as unknown as { name: string; staff_no: string; department: string } | null;
      return {
        staff_no: emp?.staff_no ?? "",
        name: emp?.name ?? "",
        department: emp?.department ?? "",
        gross: Number(p.gross),
        paye: Number(p.paye),
        nssf: Number(p.nssf),
        shif: Number(p.shif),
        housing_levy: Number(p.housing_levy),
        other_deductions: Number(p.other_deductions),
        net: Number(p.net),
      };
    });
  }

  const csv = toCsv(rows);
  const checksum = createHash("sha256").update(csv).digest("hex");

  await supabase.from("payroll_outputs").insert({
    payroll_run_id: run.id,
    output_type: type,
    row_count: rows.length,
    checksum,
    generated_by: user.id,
  });

  await logPayrollEvent(supabase, {
    orgId: appUser.org_id,
    payrollRunId: run.id,
    actorId: user.id,
    eventType: "output_generated",
    entityType: "payroll_output",
    newValue: { output_type: type, row_count: rows.length, checksum },
  });

  return csvResponse(filename, rows);
}
