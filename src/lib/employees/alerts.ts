// The Employee 360 "attention engine" (see Employee 360 build spec, §12).
// Deterministic and UI-independent so the dashboard's own attention
// summaries and the profile's "Needs Attention" card can share the same
// rules later. Takes the same shape get-employee-360.ts assembles (minus
// `alerts` itself, which this function produces).

export type AlertSeverity = "critical" | "warning" | "info";

export type EmployeeAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  href?: string;
  actionLabel?: string;
};

export type AlertInput = {
  employeeId: string;
  contractIssuedOn: string | null;
  probationEndDate: string | null;
  expiringDocuments: { id: string; title: string; expiryDate: string }[];
  overdueTraining: { id: string; courseName: string }[];
  pendingLeaveCount: number;
  missingRequiredDocs: string[];
  performanceReviewOverdue: boolean;
  noWrittenContract: boolean;
};

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function buildEmployeeAlerts(data: AlertInput): EmployeeAlert[] {
  const alerts: EmployeeAlert[] = [];

  // Document/contract expiry within 30 days.
  for (const doc of data.expiringDocuments) {
    const days = daysUntil(doc.expiryDate);
    if (days <= 30) {
      alerts.push({
        id: `doc-expiry-${doc.id}`,
        severity: days < 0 ? "critical" : days <= 7 ? "critical" : "warning",
        title: days < 0 ? `${doc.title} has expired` : `${doc.title} expires in ${days} day${days === 1 ? "" : "s"}`,
        description: "Renew or replace this document before it lapses.",
        href: `/dashboard/employees/${data.employeeId}?tab=documents`,
        actionLabel: "Review",
      });
    }
  }

  // Employment Act s.9/10: written particulars of employment.
  if (data.noWrittenContract) {
    alerts.push({
      id: "no-written-contract",
      severity: "warning",
      title: "No written contract on file",
      description: "Section 9/10 requires written particulars of employment.",
      href: `/dashboard/employees/${data.employeeId}?tab=documents`,
      actionLabel: "Upload",
    });
  }

  // s.42: probation ending within 14 days.
  if (data.probationEndDate) {
    const days = daysUntil(data.probationEndDate);
    if (days >= 0 && days <= 14) {
      alerts.push({
        id: "probation-ending",
        severity: days <= 3 ? "critical" : "warning",
        title: `Probation ends in ${days} day${days === 1 ? "" : "s"}`,
        description: "Confirm the employee or extend/end probation before it lapses.",
        href: `/dashboard/employees/${data.employeeId}?tab=employment`,
        actionLabel: "Review",
      });
    }
  }

  // Overdue mandatory training.
  for (const t of data.overdueTraining) {
    alerts.push({
      id: `training-${t.id}`,
      severity: "warning",
      title: `${t.courseName} training overdue`,
      description: "This course is mandatory and has not been completed.",
      href: `/dashboard/employees/${data.employeeId}?tab=learning`,
      actionLabel: "Review",
    });
  }

  // Pending leave request(s) awaiting a decision.
  if (data.pendingLeaveCount > 0) {
    alerts.push({
      id: "pending-leave",
      severity: "info",
      title: `${data.pendingLeaveCount} pending leave request${data.pendingLeaveCount === 1 ? "" : "s"}`,
      description: "Awaiting approval or rejection.",
      href: `/dashboard/employees/${data.employeeId}?tab=leave`,
      actionLabel: "Review",
    });
  }

  // Missing required documents (contract, ID, KRA PIN etc. — whatever the
  // caller decided is required and didn't find).
  for (const label of data.missingRequiredDocs) {
    alerts.push({
      id: `missing-doc-${label}`,
      severity: "warning",
      title: `Missing ${label}`,
      description: "Required for the personnel file.",
      href: `/dashboard/employees/${data.employeeId}?tab=documents`,
      actionLabel: "Upload",
    });
  }

  // Performance review overdue (no completed appraisal in the current cycle).
  if (data.performanceReviewOverdue) {
    alerts.push({
      id: "performance-review-overdue",
      severity: "info",
      title: "Performance review overdue",
      description: "No completed appraisal on file for the current cycle.",
      href: `/dashboard/employees/${data.employeeId}?tab=performance`,
      actionLabel: "Review",
    });
  }

  const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
