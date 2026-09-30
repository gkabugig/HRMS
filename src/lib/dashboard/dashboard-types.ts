// Shared types for Dashboard 2.0 (see HRMS_Dashboard_2_0_Build_Specification.docx,
// §17). One aggregator (get-dashboard.ts) fans out to the get-*.ts files in
// this folder, each of which returns a slice shaped for direct rendering —
// compact DTOs, not raw rows, per the spec's Performance Strategy (§21).
import type { UserRole } from "@/lib/auth/roles";

export type TrendDirection = "up" | "down" | "flat";

export type DashboardContext = {
  userId: string;
  orgId: string;
  role: UserRole;
  employeeId: string | null;
  displayName: string;
  orgName: string;
  today: string; // YYYY-MM-DD
  currentPeriod: string; // YYYY-MM, for payroll
};

export type DashboardKPI = {
  id: string;
  label: string;
  value: number | string;
  displayValue: string;
  change?: number;
  changeLabel?: string;
  trend?: TrendDirection;
  href?: string;
};

export type AlertSeverity = "critical" | "warning" | "info";

export type DashboardAlert = {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  description: string;
  entityId?: string;
  href: string;
  actionLabel: string;
};

export type WorkforceAnalytics = {
  headcountTrend: { label: string; value: number }[]; // last 12 months
  departmentBreakdown: { department: string; count: number }[];
  employmentTypeMix: { type: string; count: number }[];
  tenureDistribution: { bucket: string; count: number }[];
  turnoverRate12mo: number | null; // percentage
  totalActive: number;
  totalAtStartOf12moWindow: number;
};

export type PayrollSnapshot = {
  visible: boolean;
  period: string;
  gross: number;
  net: number;
  deductions: number;
  employeesProcessed: number;
  grossChangePct: number | null;
  netChangePct: number | null;
  deductionsChangePct: number | null;
  previousPeriod: string | null;
  hasRunForPeriod: boolean;
  availablePeriods: string[];
};

export type AttendanceSnapshot = {
  date: string;
  present: number;
  presentPct: number | null;
  late: number;
  latePct: number | null;
  absent: number;
  absentPct: number | null;
  onLeave: number;
  missingClockOut: number;
  expected: number;
  trend7day: { label: string; presentPct: number | null }[];
};

export type RecruitmentSnapshot = {
  visible: boolean;
  openPositions: number;
  candidates: number;
  screening: number;
  interviews: number;
  offers: number;
  hires: number;
};

export type ActivityItem = {
  id: string;
  description: string;
  href: string | null;
  occurredAt: string;
};

export type DashboardData = {
  context: DashboardContext;
  kpis: DashboardKPI[];
  actions: DashboardAlert[];
  workforce: WorkforceAnalytics;
  payroll: PayrollSnapshot | null;
  attendance: AttendanceSnapshot;
  recruitment: RecruitmentSnapshot | null;
  activity: ActivityItem[];
};
