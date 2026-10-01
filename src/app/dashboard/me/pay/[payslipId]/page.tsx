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
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyPayslipDetail } from "@/lib/employee-portal/get-my-pay";
import PrintButton from "./print-button";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default async function MyPayslipDetailPage({ params }: { params: Promise<{ payslipId: string }> }) {
  const { payslipId } = await params;
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const payslip = await getMyPayslipDetail(supabase, { employeeId: ctx.employeeId, payslipId, orgId: ctx.orgId, actorUserId: ctx.userId });

  if (!payslip) return notFound();

  const rows: [string, number][] = [
    ["Gross pay", payslip.gross],
    ["PAYE", -payslip.paye],
    ["NSSF", -payslip.nssf],
    ["SHIF", -payslip.shif],
    ["Housing Levy", -payslip.housingLevy],
    ...(payslip.leaveDeduction > 0 ? ([["Leave deduction", -payslip.leaveDeduction]] as [string, number][]) : []),
    ...(payslip.otherDeductions > 0 ? ([["Other deductions", -payslip.otherDeductions]] as [string, number][]) : []),
  ];

  return (
    <div className="max-w-xl mx-auto space-y-4 print:mx-0">
      <div className="flex justify-between items-center print:hidden">
        <p className="text-sm text-neutral-500">Payslip for {payslip.period}</p>
        <PrintButton />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-8 print:border-none print:shadow-none print:p-0">
        <h1 className="text-lg font-semibold text-center mb-1">PAYSLIP</h1>
        <p className="text-center text-sm text-neutral-500 mb-6">{payslip.period}</p>

        <dl className="grid grid-cols-2 gap-y-1 text-sm mb-6">
          <dt className="text-neutral-500">Name</dt>
          <dd className="text-right">{payslip.employeeName}</dd>
          <dt className="text-neutral-500">Staff No.</dt>
          <dd className="text-right">{payslip.staffNo}</dd>
          <dt className="text-neutral-500">Job title</dt>
          <dd className="text-right">{payslip.jobTitle}</dd>
          <dt className="text-neutral-500">Department</dt>
          <dd className="text-right">{payslip.department}</dd>
        </dl>

        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, amount]) => (
              <tr key={label} className="border-t border-neutral-100">
                <td className="py-1.5 text-neutral-600">{label}</td>
                <td className="py-1.5 text-right font-mono">{amount < 0 ? `-${fmt(Math.abs(amount))}` : fmt(amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-neutral-300">
              <td className="py-2 font-semibold">Net pay</td>
              <td className="py-2 text-right font-mono font-semibold">{fmt(payslip.net)}</td>
            </tr>
          </tbody>
        </table>

        {payslip.deductionCapped && (
          <p className="text-xs text-amber-600 mt-4">
            Statutory deductions were capped at two-thirds of gross pay (Employment Act s.19(3)); the remainder rolls to next period.
          </p>
        )}

        <p className="text-xs text-neutral-400 mt-6">Bank payment details are not shown here for security — contact HR to verify your payment account.</p>
      </div>

      <p className="print:hidden text-xs text-neutral-500">Use your browser&apos;s Print (Cmd/Ctrl+P) to save this as a PDF.</p>
    </div>
  );
}
