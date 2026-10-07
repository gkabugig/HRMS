// Decides what status a leave request has after it is edited.
//
// Rules (so flexibility never becomes a way round approval):
// - A decision-maker (HR/admin, or the employee's manager) editing someone
//   else's request keeps the current status: they are the approver.
// - The employee editing their own request: a Pending or Rejected request
//   goes (back) to Pending. An Approved request STAYS approved only when the
//   change can only shrink it (same leave type, new dates fully inside the
//   approved dates, no more days). Anything else needs approval again.
export type LeaveStatus = "Pending" | "Approved" | "Rejected";

export type LeaveEditInput = {
  editorIsApprover: boolean; // approver acting on someone else's request
  oldStatus: LeaveStatus;
  oldType: string;
  oldStart: string;
  oldEnd: string;
  oldDays: number;
  newType: string;
  newStart: string;
  newEnd: string;
  newDays: number;
};

export function leaveEditOutcome(i: LeaveEditInput): LeaveStatus {
  if (i.editorIsApprover) return i.oldStatus;
  if (i.oldStatus !== "Approved") return "Pending";
  const onlyShrinks =
    i.newType === i.oldType && i.newStart >= i.oldStart && i.newEnd <= i.oldEnd && i.newDays <= i.oldDays;
  return onlyShrinks ? "Approved" : "Pending";
}
