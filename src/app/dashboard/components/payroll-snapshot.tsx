import type { PayrollSnapshot as PayrollSnapshotData } from "@/lib/dashboard/dashboard-types";
import { VerticalBars } from "@/components/charts/charts";
import ChartCard from "./chart-card";

function compactKes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function change(pct: number | null, prev: string | null): string | null {
  if (pct === null || !prev) return null;
  return `${pct > 0 ? "+" : ""}${pct}% vs ${prev}`;
}

export default function PayrollSnapshotCard({ payroll }: { payroll: PayrollSnapshotData }) {
  const href = "/dashboard/payroll";
  const items = [
    { label: "Gross", value: payroll.gross, color: "var(--vivid-1)", href },
    { label: "Deductions", value: payroll.deductions, color: "var(--vivid-2)", href },
    { label: "Net pay", value: payroll.net, color: "var(--vivid-3)", href },
  ];
  const netChange = change(payroll.netChangePct, payroll.previousPeriod);
  return (
    <ChartCard title={`Payroll — ${payroll.period}`} subtitle="KES" href={href} linkLabel="Payroll" accent="var(--vivid-1)">
      {!payroll.hasRunForPeriod ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No payroll run yet.</p>
      ) : (
        <>
          <VerticalBars items={items} palette="vivid" compact height={110} valueLabel={compactKes} />
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-2">
            {payroll.employeesProcessed} employees processed{netChange ? ` · net ${netChange}` : ""}
          </p>
        </>
      )}
    </ChartCard>
  );
}
