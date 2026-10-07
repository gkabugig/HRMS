// Dashboard 2.0 — Executive HR Command Centre (see
// HRMS_Dashboard_2_0_Build_Specification.docx). Role-aware KPI row, Action
// Centre, workforce/payroll/attendance/recruitment snapshots, recent
// activity and quick actions — all fed by a single server-side aggregator
// (getDashboard) rather than one query per widget.
import { redirect } from "next/navigation";
import { getDashboard } from "@/lib/dashboard/get-dashboard";
import DashboardHeader from "./components/dashboard-header";
import KpiGrid from "./components/kpi-grid";
import ActionCentre from "./components/action-centre";
import WorkforceTrend from "./components/workforce-trend";
import WorkforceBreakdown from "./components/workforce-breakdown";
import { EmploymentMixCard, TenureCard } from "./components/workforce-mix";
import PayrollSnapshotCard from "./components/payroll-snapshot";
import AttendanceSnapshotCard from "./components/attendance-snapshot";
import RecruitmentSnapshotCard from "./components/recruitment-snapshot";
import RecentActivity from "./components/recent-activity";
import QuickActions from "./components/quick-actions";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const data = await getDashboard(period);

  if (!data) {
    return (
      <div className="max-w-sm mx-auto text-center py-16">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Account not yet set up</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Ask an admin to invite you from the Employees screen.</p>
      </div>
    );
  }

  const { context, kpis, actions, workforce, payroll, attendance, recruitment, activity } = data;
  const criticalCount = actions.filter((a) => a.severity === "critical").length;
  const isEmployeeOnly = context.role === "employee";

  // Area 05 build sequence item 19 — "convert existing employee dashboard
  // into Employee Home": rather than maintaining the stripped-down
  // ActionCentre+AttendanceSnapshotCard view inline here AND the full
  // command centre at /dashboard/me, /dashboard stays the one entry point
  // (login/nav both land here already) and simply hands an employee role
  // straight to the real implementation — the same alias relationship
  // /dashboard/employees/me already has with Employee 360.
  if (isEmployeeOnly) {
    redirect("/dashboard/me");
  }

  // Area 06 — same alias relationship as the employee redirect above: the
  // manager workspace is the real landing experience for the manager role,
  // /dashboard stays the one entry point login/nav both target.
  if (context.role === "manager") {
    redirect("/dashboard/manager");
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        context={context}
        criticalCount={criticalCount}
        availablePayrollPeriods={payroll?.availablePeriods ?? []}
        selectedPayrollPeriod={payroll?.period ?? context.currentPeriod}
      />

      <KpiGrid kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkforceTrend workforce={workforce} />
        <ActionCentre alerts={actions} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {payroll?.visible && <PayrollSnapshotCard payroll={payroll} />}
        <AttendanceSnapshotCard attendance={attendance} />
        {recruitment?.visible && <RecruitmentSnapshotCard recruitment={recruitment} />}
      </div>

      {workforce.departmentBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkforceBreakdown workforce={workforce} />
          <EmploymentMixCard workforce={workforce} />
          <TenureCard workforce={workforce} />
          <RecentActivity activity={activity} />
        </div>
      )}

      <QuickActions role={context.role} />

      {workforce.departmentBreakdown.length === 0 && <RecentActivity activity={activity} />}
    </div>
  );
}
