import PeriodSelector from "./period-selector";
import type { DashboardContext } from "@/lib/dashboard/dashboard-types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHeader({
  context,
  criticalCount,
  availablePayrollPeriods,
  selectedPayrollPeriod,
}: {
  context: DashboardContext;
  criticalCount: number;
  availablePayrollPeriods: string[];
  selectedPayrollPeriod: string;
}) {
  const dateLabel = new Date(context.today).toLocaleDateString("en-KE", {
    weekday: undefined,
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mb-6">
      {criticalCount > 0 && (
        <div className="flex justify-end mb-3">
          <a
            href="#action-centre"
            className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 hover:border-red-200"
          >
            {criticalCount} critical item{criticalCount === 1 ? "" : "s"} need attention
          </a>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
        <PeriodSelector availablePeriods={availablePayrollPeriods} current={selectedPayrollPeriod} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight capitalize">
            {greeting()}, {context.displayName}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Here&apos;s what needs your attention today.</p>
        </div>
        <span className="text-sm text-neutral-400">{dateLabel}</span>
      </div>
    </div>
  );
}
