// Area 05 §8 "secure payslip viewer/download" + §14 "log sensitive payslip
// access/download where supported". getMyPayslipDetail re-derives ownership
// server-side (employee_id = ctx.employeeId, published_at not null) rather
// than trusting the payslipId route param, and records an audit_events row
// on every view — satisfies the security acceptance test "Employee requests
// another employee's payslip -> denied; no metadata leakage" (a mismatched
// id just renders notFound(), nothing about the other payslip leaks).
// "Download" reuses the browser's own Print-to-PDF (same convention as the
// Certificate of Service page) rather than a server-rendered PDF file —
// there's no payslip storage bucket to add, and the viewer is already
// re-authorized and audited on every render, so a print-to-PDF button adds
// no new access path beyond what viewing it already logs.
//
// The document itself (PayslipDocument) is the one shared template also
// used by the HR/admin payroll-run employee view, so the payslip looks
// identical everywhere it's viewed, downloaded or printed from.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyPayslipDetail } from "@/lib/employee-portal/get-my-pay";
import PayslipDocument from "@/components/payroll/payslip-document";
import PrintButton from "./print-button";

export default async function MyPayslipDetailPage({ params }: { params: Promise<{ payslipId: string }> }) {
  const { payslipId } = await params;
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const payslip = await getMyPayslipDetail(supabase, { employeeId: ctx.employeeId, payslipId, orgId: ctx.orgId, actorUserId: ctx.userId });

  if (!payslip) return notFound();

  const extraDeductions = [
    ...(payslip.leaveDeduction > 0 ? [{ label: "Leave deduction", amount: payslip.leaveDeduction }] : []),
    ...(payslip.otherDeductions > 0 ? [{ label: "Other deductions", amount: payslip.otherDeductions }] : []),
  ];

  return (
    <div className="max-w-xl mx-auto space-y-4 print:mx-0">
      <div className="flex justify-between items-center print:hidden">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Payslip for {payslip.period}</p>
        <PrintButton />
      </div>

      <PayslipDocument
        period={payslip.period}
        employeeName={payslip.employeeName}
        staffNo={payslip.staffNo}
        department={payslip.department}
        basicSalary={payslip.basicSalary}
        allowances={payslip.allowances}
        grossPay={payslip.gross}
        nssf={payslip.nssf}
        shif={payslip.shif}
        housingLevy={payslip.housingLevy}
        paye={payslip.paye}
        netPay={payslip.net}
        employerNssf={payslip.employerNssf}
        employerHousingLevy={payslip.employerHousingLevy}
        extraDeductions={extraDeductions}
        deductionCapNote={
          payslip.deductionCapped
            ? "Statutory deductions were capped at two-thirds of gross pay (Employment Act s.19(3)); the remainder rolls to next period."
            : undefined
        }
      />

      <p className="print:hidden text-xs text-neutral-400 dark:text-neutral-500">Bank payment details are not shown here for security — contact HR to verify your payment account.</p>
      <p className="print:hidden text-xs text-neutral-500 dark:text-neutral-400">Use your browser&apos;s Print (Cmd/Ctrl+P) to save this as a PDF.</p>
    </div>
  );
}
