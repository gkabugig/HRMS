import { describe, expect, it } from "vitest";
import { DEFAULT_PROMOTION_RULE as R, evaluateGates, promotedSalary, promotionLetter, readinessScore } from "./promotion-engine";

const ok = { recentScoresPct: [82, 76], monthsInGrade: 18, hasOpenDiscipline: false, vacancyExists: null };

describe("promotion gates", () => {
  it("passes an employee who meets every gate", () => {
    expect(evaluateGates(ok, R).allPassed).toBe(true);
  });
  it("fails on a weak recent cycle, short time in grade or an open case, and says which", () => {
    expect(evaluateGates({ ...ok, recentScoresPct: [82, 65] }, R).gates.find((g) => g.key === "performance")?.passed).toBe(false);
    expect(evaluateGates({ ...ok, recentScoresPct: [90] }, R).allPassed).toBe(false); // only one review on file
    expect(evaluateGates({ ...ok, monthsInGrade: 8 }, R).gates.find((g) => g.key === "time_in_grade")?.passed).toBe(false);
    expect(evaluateGates({ ...ok, hasOpenDiscipline: true }, R).gates.find((g) => g.key === "conduct")?.passed).toBe(false);
  });
  it("adds a position gate only when the rule requires a vacancy", () => {
    expect(evaluateGates(ok, R).gates.some((g) => g.key === "position")).toBe(false);
    const withVac = evaluateGates({ ...ok, vacancyExists: false }, { ...R, requireVacancy: true });
    expect(withVac.allPassed).toBe(false);
    expect(evaluateGates({ ...ok, vacancyExists: true }, { ...R, requireVacancy: true }).allPassed).toBe(true);
  });
  it("marks the training gate as not checked", () => {
    expect(evaluateGates(ok, R).gates.find((g) => g.key === "training")?.checked).toBe(false);
  });
});

describe("readiness score", () => {
  it("weights the six criteria and maps to a recommendation", () => {
    const strong = readinessScore({ avgPerformancePct: 90, monthsInGrade: 36, competenciesPct: 85, qualificationsPct: 80, leadershipPct: 85, valuesPct: 90 }, R);
    expect(strong.label).toBe("Strongly Recommended");
    const weak = readinessScore({ avgPerformancePct: 55, monthsInGrade: 12, competenciesPct: 40, qualificationsPct: 40, leadershipPct: 40, valuesPct: 50 }, R);
    expect(weak.label).toBe("Not Ready");
  });
  it("is exactly the weighted average", () => {
    // 35% of 80 + 20% of 70 + 15% of 100 (36 months) + 10% of 60 + 10% of 50 + 10% of 90
    const r = readinessScore({ avgPerformancePct: 80, monthsInGrade: 36, competenciesPct: 70, qualificationsPct: 60, leadershipPct: 50, valuesPct: 90 }, R);
    expect(r.score).toBe(77);
    expect(r.label).toBe("Recommended");
  });
});

describe("promoted salary and letter", () => {
  it("applies the uplift but never lands below the new band minimum", () => {
    expect(promotedSalary(100000, 10, null)).toBe(110000);
    expect(promotedSalary(100000, 10, 125000)).toBe(125000);
  });
  it("merges the approved figures into the letter", () => {
    const t = promotionLetter({ name: "Jane Doe", fromTitle: "Officer", toTitle: "Senior Officer", fromGrade: "G4", toGrade: "G5", newSalary: 125000, effective: "2027-01-01", orgName: "SKMG" });
    expect(t).toContain("Senior Officer");
    expect(t).toContain("KES 125,000");
    expect(t).toContain("2027-01-01");
  });
});
