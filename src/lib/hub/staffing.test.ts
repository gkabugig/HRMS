import { describe, expect, it } from "vitest";
import { staffingShortfalls } from "./staffing";

const staff = [
  { branch_id: "A", job_title: "Senior Optometrist" },
  { branch_id: "A", job_title: "Sales Assistant" },
  { branch_id: "B", job_title: "Sales assistant" },
  { branch_id: "B", job_title: "Sales Assistant" },
  { branch_id: null, job_title: "Optometrist" },
];

describe("staffing rules", () => {
  const rules = [
    { id: "r1", branch_id: null, job_title: "Optometrist", min_count: 1 },
    { id: "r2", branch_id: null, job_title: "Sales Assistant", min_count: 2 },
  ];
  it("finds branches below the minimum", () => {
    const s = staffingShortfalls(["A", "B"], rules, staff);
    expect(s).toEqual([
      { branchId: "A", ruleId: "r2", jobTitle: "Sales Assistant", required: 2, actual: 1, missing: 1 },
      { branchId: "B", ruleId: "r1", jobTitle: "Optometrist", required: 1, actual: 0, missing: 1 },
    ]);
  });
  it("applies a rule to only its own branch", () => {
    const s = staffingShortfalls(["A", "B"], [{ id: "r3", branch_id: "B", job_title: "Optometrist", min_count: 1 }], staff);
    expect(s).toHaveLength(1);
    expect(s[0].branchId).toBe("B");
  });
  it("matches job titles ignoring case and extra words", () => {
    expect(staffingShortfalls(["A"], [{ id: "r", branch_id: null, job_title: "optometrist", min_count: 1 }], staff)).toHaveLength(0);
  });
  it("reports nothing when there are no rules", () => {
    expect(staffingShortfalls(["A"], [], staff)).toEqual([]);
  });
});
