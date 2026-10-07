export const STAGES = ["Applied", "Screened", "Shortlisted", "Interviewed", "Offered", "Hired", "Rejected"] as const;
export type Stage = (typeof STAGES)[number];

// Board columns: Rejected is shown in its own collapsed list, Hired is final.
export const BOARD_STAGES: Stage[] = ["Applied", "Screened", "Shortlisted", "Interviewed", "Offered", "Hired"];

export const REJECTION_REASONS = [
  "Not enough experience",
  "Skills don't match the role",
  "Failed interview",
  "Salary expectations too high",
  "Withdrew / no longer interested",
  "Position filled",
  "Other",
] as const;

// Moving to "Hired" only happens through the hire action (it creates the
// employee record), never by picking the stage from a list.
export function canMoveTo(from: string, to: string): string | null {
  if (from === to) return "The candidate is already at that stage.";
  if (to === "Hired") return "Use the Hire button, which also creates the employee record.";
  if (from === "Hired") return "A hired candidate can't be moved. Edit the employee record instead.";
  return null;
}

// "Reject" needs a reason so the decision can be explained later.
export function checkRejectionReason(reason: string | null | undefined): string | null {
  const r = (reason ?? "").trim();
  if (r.length < 3) return "Choose or write a reason for rejecting this candidate.";
  return null;
}
