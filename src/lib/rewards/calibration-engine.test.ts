import { describe, expect, it } from "vitest";
import { calibrationFlags, fairnessBy, ratingDistribution, serviceBand, type CalRow, type Person } from "./calibration-engine";

const order = ["Exceptional", "Strong", "Meets"];
const row = (o: Partial<CalRow>): CalRow => ({ recId: "r", employeeId: "e", name: "A", department: "Ops", managerId: "m", managerName: "Mgr", rewardType: "merit", rating: "Meets", pct: 5, meritMin: 3, meritMax: 7, calculated: 100, recommended: 100, bonusCapped: false, bonusOverCap: false, missingEvidence: false, excluded: false, ...o });

describe("calibration", () => {
  it("flags a manager whose top-rating share is well above the organisation", () => {
    const rows = [...[...Array(4)].map((_, i) => row({ recId: `a${i}`, managerName: "Hi", rating: "Exceptional" })), ...[...Array(8)].map((_, i) => row({ recId: `b${i}`, managerName: "Lo", rating: "Meets" }))];
    const f = calibrationFlags(rows, order);
    expect(f.some((x) => x.kind === "rating_skew" && x.group === "Hi")).toBe(true);
    expect(f.some((x) => x.kind === "rating_skew" && x.group === "Lo")).toBe(false);
  });
  it("flags out-of-range merit and big override gaps, ignores excluded", () => {
    const f = calibrationFlags([row({ pct: 9 }), row({ recId: "x", recommended: 150, pct: 5 }), row({ recId: "y", pct: 20, excluded: true })], order);
    expect(f.filter((x) => x.kind === "merit_out_of_range")).toHaveLength(1);
    expect(f.filter((x) => x.kind === "override_gap")).toHaveLength(1);
  });
  it("distribution shares", () => {
    const d = ratingDistribution([{ rating: "Meets" }, { rating: "Meets" }, { rating: "Strong" }, { rating: null }], order);
    expect(d.find((x) => x.rating === "Meets")?.share).toBeCloseTo(66.67, 1);
  });
  it("hides fairness groups under five", () => {
    const p = (g: string): Person => ({ gender: g, department: "Ops", grade: "G1", monthsService: 10, pct: 5, bonus: 100, promoted: false });
    const out = fairnessBy([...Array(5)].map(() => p("Female")).concat([...Array(2)].map(() => p("Male"))), (x) => x.gender ?? "Not stated");
    expect(out.find((g) => g.group === "Male")?.hidden).toBe(true);
    expect(out.find((g) => g.group === "Male")?.avgMeritPct).toBeNull();
    expect(out.find((g) => g.group === "Female")?.avgMeritPct).toBe(5);
  });
  it("service bands", () => {
    expect(serviceBand(6)).toBe("Under 1 year");
    expect(serviceBand(60)).toBe("5+ years");
  });
});
