import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";
import { VerticalBars } from "@/components/charts/charts";
import ChartCard from "./chart-card";

export default function WorkforceTrend({ workforce }: { workforce: WorkforceAnalytics }) {
  const items = workforce.headcountTrend.map((p) => ({ label: p.label, value: p.value, href: "/dashboard/employees" }));
  return (
    <ChartCard
      title="Workforce Trend"
      subtitle={workforce.turnoverRate12mo !== null ? `Headcount by month · turnover (12mo) ${workforce.turnoverRate12mo}%` : "Headcount by month"}
      href="/dashboard/employees"
      linkLabel="Employees"
      accent="var(--vivid-1)"
    >
      {items.length > 0 ? (
        <VerticalBars items={items} palette="vivid" multicolor compact height={150} />
      ) : (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-8 text-center">Not enough data yet.</p>
      )}
    </ChartCard>
  );
}
