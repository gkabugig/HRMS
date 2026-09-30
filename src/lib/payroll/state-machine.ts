// Payroll workflow state machine (spec §4, §24). The UI reflects state;
// this module is the only place transitions are decided, and every action
// that changes payroll_runs.status calls assertTransition() first so the
// rule is enforced server-side, not by which buttons the UI happens to
// show (spec §4's "control rule").
export type PayrollStatus =
  | "draft"
  | "inputs_open"
  | "calculated"
  | "under_review"
  | "approved"
  | "processed"
  | "paid"
  | "closed";

export const PAYROLL_STATUSES: PayrollStatus[] = [
  "draft",
  "inputs_open",
  "calculated",
  "under_review",
  "approved",
  "processed",
  "paid",
  "closed",
];

export const STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  inputs_open: "Inputs Open",
  calculated: "Calculated",
  under_review: "Under Review",
  approved: "Approved",
  processed: "Processed",
  paid: "Paid",
  closed: "Closed",
};

const allowedTransitions: Record<PayrollStatus, PayrollStatus[]> = {
  draft: ["inputs_open"],
  inputs_open: ["calculated"],
  calculated: ["under_review"],
  under_review: ["calculated", "approved"],
  approved: ["processed"],
  processed: ["paid"],
  paid: ["closed"],
  closed: [],
};

// Who may perform each transition, per spec §4's "Who can transition"
// column. This app only has admin/hr/manager/employee roles (no separate
// Payroll Officer / Finance Approver role exists in user_role) — admin and
// hr already cover every payroll-facing responsibility the spec assigns to
// those titles, matching how payroll access is scoped everywhere else in
// this codebase (statutory_rates, payroll_runs RLS: admin/hr only).
const transitionRoles: Record<PayrollStatus, ("admin" | "hr")[]> = {
  draft: ["admin", "hr"],
  inputs_open: ["admin", "hr"],
  calculated: ["admin", "hr"],
  under_review: ["admin", "hr"],
  approved: ["admin", "hr"],
  processed: ["admin", "hr"],
  paid: ["admin", "hr"],
  closed: ["admin", "hr"],
};

export class InvalidTransitionError extends Error {}

export function assertTransition(from: PayrollStatus, to: PayrollStatus, role: string): void {
  if (!allowedTransitions[from]?.includes(to)) {
    throw new InvalidTransitionError(`Payroll cannot move from "${STATUS_LABELS[from]}" to "${STATUS_LABELS[to]}".`);
  }
  if (!transitionRoles[to].includes(role as "admin" | "hr")) {
    throw new InvalidTransitionError(`Your role cannot move payroll to "${STATUS_LABELS[to]}".`);
  }
}

export function nextStatuses(from: PayrollStatus): PayrollStatus[] {
  return allowedTransitions[from] ?? [];
}
