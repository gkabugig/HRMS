import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";
import { Doughnut } from "@/components/charts/charts";
import ChartCard from "./chart-card";

export default function WorkforceBreakdown({ workforce }: { workforce: WorkforceAnalytics }) {
  const items = workforce.departmentBreakdown.map((d) => ({ label: d.department, value: d.count, href: "/dashboard/employees" }));
  return (
    <ChartCard title="Department Headcount" subtitle="Active employees by department" href="/dashboard/employees" linkLabel="Employees" accent="var(--vivid-6)">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No active employees yet.</p>
      ) : (
        <Doughnut items={items} palette="vivid" centreLabel="employees" />
      )}
    </ChartCard>
  );
}
