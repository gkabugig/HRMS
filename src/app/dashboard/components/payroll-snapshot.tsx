import Link from "next/link";
import type { PayrollSnapshot as PayrollSnapshotData } from "@/lib/dashboard/dashboard-types";

function money(n: number): string {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function changeLabel(pct: number | null, previousPeriod: string | null): string | null {
  if (pct === null || !previousPeriod) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs ${previousPeriod}`;
}

export default function PayrollSnapshotCard({ payroll }: { payroll: PayrollSnapshotData }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full flex flex-col">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Payroll — {payroll.period}</h2>
      {!payroll.hasRunForPeriod ? (
        <p className="text-sm text-neutral-400 flex-1">No payroll run yet.</p>
      ) : (
        <div className="space-y-2 flex-1">
          <Row label="Gross" value={money(payroll.gross)} change={changeLabel(payroll.grossChangePct, payroll.previousPeriod)} />
          <Row label="Deductions" value={money(payroll.deductions)} change={changeLabel(payroll.deductionsChangePct, payroll.previousPeriod)} />
          <Row label="Net" value={money(payroll.net)} change={changeLabel(payroll.netChangePct, payroll.previousPeriod)} strong />
          <Row label="Employees processed" value={String(payroll.employeesProcessed)} />
        </div>
      )}
      <Link href="/dashboard/payroll" className="mt-4 text-xs font-medium text-brand-600 hover:text-brand-700">
        View Payroll →
      </Link>
    </div>
  );
}

function Row({ label, value, change, strong }: { label: string; value: string; change?: string | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-right">
        <span className={`text-sm ${strong ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>{value}</span>
        {change && <span className="ml-2 text-[11px] text-neutral-400">{change}</span>}
      </span>
    </div>
  );
}
