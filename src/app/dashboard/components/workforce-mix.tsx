import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";
import { Doughnut, VerticalBars } from "@/components/charts/charts";
import ChartCard from "./chart-card";

export function EmploymentMixCard({ workforce }: { workforce: WorkforceAnalytics }) {
  const items = workforce.employmentTypeMix.map((m) => ({ label: m.type, value: m.count, href: "/dashboard/employees" }));
  return (
    <ChartCard title="Employment Type" subtitle="Permanent, contract, casual and interns" href="/dashboard/employees" linkLabel="Employees" accent="var(--vivid-3)">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No data yet.</p>
      ) : (
        <Doughnut items={items} palette="vivid" centreLabel="employees" />
      )}
    </ChartCard>
  );
}

export function TenureCard({ workforce }: { workforce: WorkforceAnalytics }) {
  const items = workforce.tenureDistribution.map((t) => ({ label: t.bucket, value: t.count, href: "/dashboard/employees" }));
  return (
    <ChartCard title="Length of Service" subtitle="How long people have been with us" href="/dashboard/employees" linkLabel="Employees" accent="var(--vivid-8)">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No data yet.</p>
      ) : (
        <VerticalBars items={items} palette="vivid" multicolor compact height={140} />
      )}
    </ChartCard>
  );
}
