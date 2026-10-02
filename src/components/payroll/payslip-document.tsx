// The one visual template for a payslip, shared by the employee
// self-service viewer (dashboard/me/pay/[payslipId]) and the HR/admin
// payroll-run employee view (dashboard/payroll/[payrollRunId]/employee/
// [employeeId]) so the actual document looks identical wherever it's
// viewed, downloaded or printed from. Styling is fixed "paper" colors
// rather than the app's light/dark surface tokens - a payslip is a printed
// document, not a dashboard panel, and should look the same regardless of
// which theme the viewer has the rest of the app set to.
import type { ReactNode } from "react";

function fmt(n: number): string {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

export type PayslipDocumentProps = {
  period: string;
  employeeName: string;
  staffNo: string;
  department: string;
  basicSalary: number;
  allowances: number;
  grossPay: number;
  nssf: number;
  shif: number;
  housingLevy: number;
  paye: number;
  netPay: number;
  employerNssf: number;
  employerHousingLevy: number;
  /** Extra deduction rows beyond the five statutory ones above - shown only when present, so a clean payslip renders exactly as the reference format. */
  extraDeductions?: { label: string; amount: number }[];
  deductionCapNote?: string;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-[#e3e6da] text-sm">
      <span className="font-serif text-[#3f4a3a]">{label}</span>
      <span className="font-mono text-[#1f2a1f]">{value}</span>
    </div>
  );
}

function AmountRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between py-2 text-sm ${
        strong ? "border-y-2 border-[#1f2a1f] font-bold" : "border-b border-[#e3e6da]"
      }`}
    >
      <span className="font-serif text-[#1f2a1f]">{label}</span>
      <span className="font-mono text-[#1f2a1f]">{fmt(value)}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-serif font-bold text-sm text-[#1f2a1f] pt-5 pb-2 border-b border-[#1f2a1f]">{children}</h2>;
}

export default function PayslipDocument({
  period,
  employeeName,
  staffNo,
  department,
  basicSalary,
  allowances,
  grossPay,
  nssf,
  shif,
  housingLevy,
  paye,
  netPay,
  employerNssf,
  employerHousingLevy,
  extraDeductions = [],
  deductionCapNote,
}: PayslipDocumentProps) {
  return (
    <div className="bg-[#faf9f2] border border-[#1f2a1f]/60 rounded-sm shadow-sm p-10 print:border print:shadow-none">
      <h1 className="font-serif font-bold text-3xl text-center text-[#1f2a1f]">Payslip</h1>
      <p className="font-serif text-center text-sm text-[#5a6a52] pb-4 mb-4 border-b border-[#1f2a1f]/30">{period}</p>

      <InfoRow label="Employee" value={employeeName} />
      <InfoRow label="Staff No." value={staffNo} />
      <InfoRow label="Department" value={department} />

      <SectionHeading>Earnings</SectionHeading>
      <AmountRow label="Basic Salary" value={basicSalary} />
      <AmountRow label="Allowances" value={allowances} />
      <AmountRow label="Gross Pay" value={grossPay} strong />

      <SectionHeading>Statutory Deductions</SectionHeading>
      <AmountRow label="NSSF" value={nssf} />
      <AmountRow label="SHIF" value={shif} />
      <AmountRow label="Affordable Housing Levy" value={housingLevy} />
      <AmountRow label="PAYE" value={paye} />
      {extraDeductions.map((d) => (
        <AmountRow key={d.label} label={d.label} value={d.amount} />
      ))}
      <AmountRow label="Net Pay" value={netPay} strong />

      {deductionCapNote && <p className="font-serif text-xs text-amber-700 mt-4">{deductionCapNote}</p>}

      <p className="font-serif italic text-xs text-[#5a6a52] mt-5">
        Employer also remits a matching NSSF contribution of {fmt(employerNssf)} and Housing Levy of {fmt(employerHousingLevy)} on this employee&apos;s
        behalf.
      </p>
    </div>
  );
}
