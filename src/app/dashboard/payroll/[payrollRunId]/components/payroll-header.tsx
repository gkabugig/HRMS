import Link from "next/link";
import PayrollStatusBadge from "../../components/payroll-status-badge";
import PayrollPeriodSelector from "../../components/payroll-period-selector";
import type { PayrollRunSummary } from "@/lib/payroll/command-centre-types";
import type { PayrollStatus } from "@/lib/payroll/state-machine";

export default function PayrollHeader({
  run,
  orgName,
  availableRuns,
}: {
  run: PayrollRunSummary;
  orgName: string;
  availableRuns: { id: string; period: string; status: PayrollStatus }[];
}) {
  const label = new Date(`${run.period}-01`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

  return (
    <div className="mb-6">
      <Link href="/dashboard/payroll" className="text-xs text-neutral-400 hover:text-neutral-600 mb-2 inline-block">
        ← Payroll
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-neutral-900 tracking-tight uppercase">{label} Payroll</h1>
            <PayrollStatusBadge status={run.status} />
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {run.employeeCount} employees • {orgName} • Kenya
            {run.locked && <span className="text-neutral-400"> • Locked</span>}
          </p>
        </div>
        <PayrollPeriodSelector runs={availableRuns} current={run.id} />
      </div>
    </div>
  );
}
