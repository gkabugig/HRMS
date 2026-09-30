import type { PayrollStatus } from "./state-machine";

export type PayrollContext = {
  userId: string;
  orgId: string;
  role: "admin" | "hr" | "manager" | "employee";
  employeeId: string | null;
  orgName: string;
};

export type PayrollRunSummary = {
  id: string;
  period: string;
  status: PayrollStatus;
  locked: boolean;
  generatedAt: string;
  employeeCount: number;
};

export type PayrollKpi = {
  id: string;
  label: string;
  displayValue: string;
  changeLabel?: string;
  trend?: "up" | "down" | "flat";
  href?: string;
};

export type PayrollExceptionRow = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  exceptionType: string;
  severity: "critical" | "warning" | "info";
  message: string;
  status: "open" | "resolved" | "waived";
  source: "auto" | "manual";
  resolutionNote: string | null;
};

export type PayrollHealthCheck = {
  id: string;
  label: string;
  ok: boolean;
};

export type PayrollChanges = {
  headcountDelta: number;
  newHires: number;
  exits: number;
  promotions: number;
  salaryChanges: number;
  allowanceChanges: number;
  grossChangePct: number | null;
  netChangePct: number | null;
  largestIncreases: { employeeId: string; name: string; delta: number }[];
  largestDecreases: { employeeId: string; name: string; delta: number }[];
};

export type StatutoryLine = {
  code: string;
  label: string;
  employeeTotal: number;
  employerTotal: number;
  ready: boolean;
};

export type ReconciliationCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type PayrollApprovalRecord = {
  id: string;
  stage: string;
  approverName: string | null;
  decision: "approved" | "rejected" | "returned";
  comment: string | null;
  decidedAt: string;
};

export type PayrollOutputRecord = {
  id: string;
  outputType: string;
  rowCount: number;
  checksum: string;
  generatedByName: string | null;
  createdAt: string;
};

export type PayrollRegisterRow = {
  id: string; // employee id
  name: string;
  staffNo: string;
  department: string;
  basic: number;
  allowances: number;
  gross: number;
  paye: number | null;
  nssf: number | null;
  shif: number | null;
  housingLevy: number | null;
  otherDeductions: number | null;
  net: number;
  netAdjusted: number;
  variancePct: number | null;
  status: "Ready" | "Exception";
};

export type PayrollCommandCentreData = {
  context: PayrollContext;
  run: PayrollRunSummary;
  availableRuns: { id: string; period: string; status: PayrollStatus }[];
  kpis: PayrollKpi[];
  exceptions: PayrollExceptionRow[];
  health: PayrollHealthCheck[];
  changes: PayrollChanges;
  statutory: StatutoryLine[];
  reconciliation: ReconciliationCheck[];
  approvals: PayrollApprovalRecord[];
  outputs: PayrollOutputRecord[];
  auditEvents: { id: string; eventType: string; actorName: string | null; reason: string | null; createdAt: string }[];
  canManage: boolean;
  canSeeIndividualSalary: boolean;
};
