import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics, getMetricTrend } from "@/lib/intelligence/metrics/compute-metrics";
import MetricCard from "./components/metric-card";
import Sparkline from "./components/sparkline";
import SegmentTable from "./components/segment-table";

const DASHBOARDS = [
  { key: "executive", label: "Executive" },
  { key: "headcount", label: "Headcount" },
  { key: "cost", label: "Cost" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "recruitment", label: "Recruitment" },
  { key: "performance", label: "Performance" },
  { key: "learning", label: "Learning" },
  { key: "compliance", label: "Compliance" },
  { key: "planning", label: "Planning & Workflow" },
] as const;

type DashboardKey = (typeof DASHBOARDS)[number]["key"];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const activeView = (DASHBOARDS.find((d) => d.key === view)?.key ?? "executive") as DashboardKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">
        Workforce Analytics is visible to HR and admin roles.
      </div>
    );
  }

  const metrics = await computeWorkforceMetrics(supabase, appUser.org_id);
  const headcountTrend = activeView === "executive" || activeView === "headcount" ? await getMetricTrend(supabase, "headcount_active") : [];
  const costTrend = activeView === "cost" ? await getMetricTrend(supabase, "payroll_cost_gross") : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Workforce Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Trusted metrics with drill-down. Every figure links back to its definition, formula and population.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/analytics/kpi-explorer"
            className="text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            KPI Explorer
          </Link>
          <Link
            href="/dashboard/analytics/forecasts"
            className="text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            Forecasts
          </Link>
          <Link
            href="/dashboard/analytics/data-quality"
            className="text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            Data Quality
          </Link>
          <a
            href={`/dashboard/analytics/export?view=${activeView}`}
            className="text-sm border border-neutral-300 rounded-lg px-3 py-2 hover:bg-neutral-50 transition-colors"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto">
        {DASHBOARDS.map((d) => (
          <Link
            key={d.key}
            href={`/dashboard/analytics?view=${d.key}`}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeView === d.key ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {d.label}
          </Link>
        ))}
      </div>

      {activeView === "executive" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard metric={metrics.headcountActive} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.turnoverRate} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.payrollCostGross} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.attendancePresenceRate} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.recruitmentOpenRoles} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.performanceAppraisalCompletion} computedAt={metrics.computedAt} />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-1">Headcount trend</h2>
            <Sparkline points={headcountTrend} />
          </div>
        </>
      )}

      {activeView === "headcount" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard metric={metrics.headcountActive} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.headcountNewHires} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.headcountExits} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.turnoverRate} computedAt={metrics.computedAt} />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-1">Headcount trend</h2>
            <Sparkline points={headcountTrend} />
          </div>
          <SegmentTable title="Headcount by department" rows={metrics.headcountByDepartment} unit="count" />
        </>
      )}

      {activeView === "cost" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard metric={metrics.payrollCostGross} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.payrollCostPerEmployee} computedAt={metrics.computedAt} />
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-1">Payroll cost trend</h2>
            <Sparkline points={costTrend} />
          </div>
          <SegmentTable title="Cost by department (latest run)" rows={metrics.costByDepartment} unit="currency" />
        </>
      )}

      {activeView === "attendance" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MetricCard metric={metrics.attendancePresenceRate} computedAt={metrics.computedAt} />
            <MetricCard metric={metrics.attendanceLatenessRate} computedAt={metrics.computedAt} />
          </div>
          <SegmentTable title="Presence rate by department (trailing 30 days)" rows={metrics.presenceByDepartment} unit="percent" />
        </>
      )}

      {activeView === "leave" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard metric={metrics.leaveUtilisation} computedAt={metrics.computedAt} />
        </div>
      )}

      {activeView === "recruitment" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard metric={metrics.recruitmentOpenRoles} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.recruitmentTimeToFill} computedAt={metrics.computedAt} />
        </div>
      )}

      {activeView === "performance" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard metric={metrics.performanceGoalCompletion} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.performanceAppraisalCompletion} computedAt={metrics.computedAt} />
        </div>
      )}

      {activeView === "learning" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard metric={metrics.learningCompletionRate} computedAt={metrics.computedAt} />
        </div>
      )}

      {activeView === "compliance" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard metric={metrics.complianceExpiringDocuments} computedAt={metrics.computedAt} />
        </div>
      )}

      {activeView === "planning" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard metric={metrics.fte} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.vacancyRate} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.overtimeHours} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.approvalAgeing} computedAt={metrics.computedAt} />
          <MetricCard metric={metrics.caseSlaCompliance} computedAt={metrics.computedAt} />
        </div>
      )}
    </div>
  );
}
