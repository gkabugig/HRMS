import { describe, it, expect } from "vitest";
import { leaveEditOutcome, type LeaveEditInput } from "./leave-edit-outcome";

const base: LeaveEditInput = {
  editorIsApprover: false,
  oldStatus: "Approved",
  oldType: "Annual",
  oldStart: "2026-11-02",
  oldEnd: "2026-11-06",
  oldDays: 5,
  newType: "Annual",
  newStart: "2026-11-02",
  newEnd: "2026-11-06",
  newDays: 5,
};

describe("leaveEditOutcome", () => {
  it("approver edits keep the status", () => {
    expect(leaveEditOutcome({ ...base, editorIsApprover: true, newEnd: "2026-11-20", newDays: 15 })).toBe("Approved");
    expect(leaveEditOutcome({ ...base, editorIsApprover: true, oldStatus: "Rejected" })).toBe("Rejected");
  });
  it("employee shortening an approved request keeps it approved", () => {
    expect(leaveEditOutcome({ ...base, newEnd: "2026-11-04", newDays: 3 })).toBe("Approved");
  });
  it("employee extending, moving or changing type needs approval again", () => {
    expect(leaveEditOutcome({ ...base, newEnd: "2026-11-09", newDays: 6 })).toBe("Pending");
    expect(leaveEditOutcome({ ...base, newStart: "2026-11-09", newEnd: "2026-11-13" })).toBe("Pending");
    expect(leaveEditOutcome({ ...base, newType: "Sick" })).toBe("Pending");
  });
  it("employee edits of pending or rejected requests are (re)submitted as pending", () => {
    expect(leaveEditOutcome({ ...base, oldStatus: "Pending" })).toBe("Pending");
    expect(leaveEditOutcome({ ...base, oldStatus: "Rejected" })).toBe("Pending");
  });
});
