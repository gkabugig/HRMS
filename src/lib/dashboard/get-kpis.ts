// KPI Row (spec §4-5). A pure composition function — everything it needs
// has already been fetched by the other get-*.ts files, so this just
// shapes a role-specific 4-6 card set (never invents its own queries).
import { kpiOrderForRole } from "./dashboard-permissions";
import type { DashboardPermissions } from "./dashboard-permissions";
import type {
  DashboardContext,
  DashboardKPI,
  WorkforceAnalytics,
  AttendanceSnapshot,
  PayrollSnapshot,
  RecruitmentSnapshot,
} from "./dashboard-types";

function money(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toFixed(0)}`;
}

export function getDashboardKpis(input: {
  context: DashboardContext;
  permissions: DashboardPermissions;
  workforce: WorkforceAnalytics;
  attendance: AttendanceSnapshot;
  payroll: PayrollSnapshot | null;
  recruitment: RecruitmentSnapshot | null;
  actionsCount: number;
  criticalActionsCount: number;
}): DashboardKPI[] {
  const { context, workforce, attendance, payroll, recruitment, actionsCount, criticalActionsCount } = input;

  const all: Record<string, DashboardKPI> = {
    headcount: {
      id: "headcount",
      label: "Employees",
      value: workforce.totalActive,
      displayValue: String(workforce.totalActive),
      change: workforce.totalActive - workforce.totalAtStartOf12moWindow,
      changeLabel: "vs 12mo ago",
      trend:
        workforce.totalActive > workforce.totalAtStartOf12moWindow
          ? "up"
          : workforce.totalActive < workforce.totalAtStartOf12moWindow
          ? "down"
          : "flat",
      href: "/dashboard/employees",
    },
    "team-headcount": {
      id: "team-headcount",
      label: "Team",
      value: workforce.totalActive,
      displayValue: String(workforce.totalActive),
      href: "/dashboard/employees",
    },
    "present-today": {
      id: "present-today",
      label: "Present Today",
      value: attendance.present,
      displayValue: String(attendance.present),
      changeLabel: attendance.presentPct !== null ? `${attendance.presentPct}%` : undefined,
      href: "/dashboard/attendance",
    },
    "my-attendance": {
      id: "my-attendance",
      label: "My Attendance Today",
      value: attendance.present > 0 ? "Clocked in" : "Not clocked in",
      displayValue: attendance.present > 0 ? "Clocked in" : "Not clocked in",
      href: "/dashboard/attendance",
    },
    "on-leave": {
      id: "on-leave",
      label: "On Leave",
      value: attendance.onLeave,
      displayValue: String(attendance.onLeave),
      changeLabel: attendance.expected > 0 ? `${Math.round((attendance.onLeave / attendance.expected) * 1000) / 10}% of workforce` : undefined,
      href: "/dashboard/leave",
    },
    "my-leave-balance": {
      id: "my-leave-balance",
      label: "My Leave",
      value: "View balance",
      displayValue: "View balance",
      href: "/dashboard/leave",
    },
    "needs-attention": {
      id: "needs-attention",
      label: "Needs Attention",
      value: actionsCount,
      displayValue: String(actionsCount),
      changeLabel: criticalActionsCount > 0 ? `${criticalActionsCount} critical` : "none critical",
      trend: criticalActionsCount > 0 ? "up" : "flat",
      href: "#action-centre",
    },
    "payroll-cost": payroll
      ? {
          id: "payroll-cost",
          label: "Payroll Cost",
          value: payroll.gross,
          displayValue: payroll.hasRunForPeriod ? money(payroll.gross) : "No run yet",
          change: payroll.grossChangePct ?? undefined,
          changeLabel: payroll.grossChangePct !== null ? `${payroll.grossChangePct}% vs ${payroll.previousPeriod ?? "prior period"}` : undefined,
          trend: payroll.grossChangePct === null ? "flat" : payroll.grossChangePct > 0 ? "up" : payroll.grossChangePct < 0 ? "down" : "flat",
          href: "/dashboard/payroll",
        }
      : {
          id: "payroll-cost",
          label: "Payroll Cost",
          value: 0,
          displayValue: "—",
          href: "/dashboard/payroll",
        },
    "open-positions": {
      id: "open-positions",
      label: "Open Positions",
      value: recruitment?.openPositions ?? 0,
      displayValue: String(recruitment?.openPositions ?? 0),
      changeLabel: recruitment ? `${recruitment.candidates} candidates in pipeline` : undefined,
      href: "/dashboard/recruitment",
    },
  };

  return kpiOrderForRole(context.role)
    .map((id) => all[id])
    .filter((k): k is DashboardKPI => Boolean(k));
}
