import CommandSearch from "./command-search";
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <CommandSearch role={context.role} />
        <div className="flex items-center gap-3">
          <PeriodSelector availablePeriods={availablePayrollPeriods} current={selectedPayrollPeriod} />
          {criticalCount > 0 && (
            <a
              href="#action-centre"
              className="relative flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] text-neutral-500 hover:border-red-200"
              aria-label={`${criticalCount} critical alerts`}
            >
              <span className="text-sm">🔔</span>
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {criticalCount}
              </span>
            </a>
          )}
        </div>
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
