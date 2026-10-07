import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, validatePolicy } from "./config";
import { bandFor, bonusWithinDiscretion, checkEligibility, completedMonths, computeBonus, computeMerit, computeSchemePayout, rangePositionOf, scoreToPct } from "./engine";

const P = DEFAULT_POLICY;

describe("spec section 11 worked example", () => {
  // Senior Finance Officer, KES 180,000/month, Exceeds Expectations, mid range.
  it("bonus is KES 297,000 and the cap of 324,000 is not reached", () => {
    const band = bandFor(85, P.bands);
    expect(band.rating).toBe("Exceeds Expectations");
    const r = computeBonus({ monthlySalary: 180000, targetPct: 10, performanceFactor: band.factor, companyFactor: 1.1, eligibilityFactor: 1, capPctOfTarget: 150 });
    expect(r.annualBase).toBe(2160000);
    expect(r.targetBonus).toBe(216000);
    expect(r.amount).toBe(297000);
    expect(r.cap).toBe(324000);
    expect(r.capped).toBe(false);
  });

  it("merit is 5.5% inside the 4 to 6% cell, giving KES 189,900", () => {
    const pos = rangePositionOf(180000, 140000, 220000, P); // midpoint 180,000 -> ratio 1.0
    expect(pos.position).toBe("mid");
    const m = computeMerit({ salary: 180000, rating: "Exceeds Expectations", position: pos.position, bandMax: 220000, policy: P, overridePct: 5.5 });
    expect(m.cell).toEqual({ min: 4, max: 6 });
    expect(m.outsideRange).toBe(false);
    expect(m.newSalary).toBe(189900);
  });
});

describe("performance bands", () => {
  it("maps scores to the five bands", () => {
    expect(bandFor(95, P.bands).rating).toBe("Exceptional");
    expect(bandFor(90, P.bands).rating).toBe("Exceptional");
    expect(bandFor(89.9, P.bands).rating).toBe("Exceeds Expectations");
    expect(bandFor(70, P.bands).factor).toBe(1);
    expect(bandFor(65, P.bands).factor).toBe(0.5);
    expect(bandFor(59, P.bands).factor).toBe(0);
  });
  it("converts a 0-5 appraisal score to a percentage", () => {
    expect(scoreToPct(4.25)).toBe(85);
    expect(scoreToPct(5)).toBe(100);
  });
});

describe("merit engine", () => {
  it("proposes the middle of the cell and flags figures outside it", () => {
    const base = { salary: 100000, rating: "Meets Expectations", position: "mid" as const, bandMax: null, policy: P };
    expect(computeMerit(base).proposedPct).toBe(3.5);
    expect(computeMerit({ ...base, overridePct: 4.5 }).outsideRange).toBe(true);
    expect(computeMerit({ ...base, overridePct: 3 }).outsideRange).toBe(false);
  });
  it("pays more for the same rating when low in the band", () => {
    const a = computeMerit({ salary: 100000, rating: "Exceptional", position: "below", bandMax: null, policy: P });
    const b = computeMerit({ salary: 100000, rating: "Exceptional", position: "above", bandMax: null, policy: P });
    expect(a.pct).toBeGreaterThan(b.pct);
  });
  it("flags an increase that would pass the band maximum", () => {
    const m = computeMerit({ salary: 215000, rating: "Exceptional", position: "above", bandMax: 220000, policy: P });
    expect(m.exceedsBandMax).toBe(true);
  });
  it("pays nothing for Does Not Meet", () => {
    expect(computeMerit({ salary: 100000, rating: "Does Not Meet", position: "below", bandMax: null, policy: P }).newSalary).toBe(100000);
  });
  it("classifies range position by midpoint ratio", () => {
    expect(rangePositionOf(80000, 80000, 120000, P).position).toBe("below"); // 0.8
    expect(rangePositionOf(130000, 80000, 120000, P).position).toBe("above"); // 1.3
    expect(rangePositionOf(100000, null, null, P).position).toBe("mid");
  });
});

describe("bonus engine", () => {
  it("caps at 150% of target", () => {
    const r = computeBonus({ monthlySalary: 100000, targetPct: 10, performanceFactor: 1.5, companyFactor: 1.5, eligibilityFactor: 1, capPctOfTarget: 150 });
    expect(r.uncapped).toBe(270000);
    expect(r.amount).toBe(180000);
    expect(r.capped).toBe(true);
  });
  it("prorates through the eligibility factor", () => {
    const r = computeBonus({ monthlySalary: 100000, targetPct: 10, performanceFactor: 1, companyFactor: 1, eligibilityFactor: 0.5, capPctOfTarget: 150 });
    expect(r.amount).toBe(60000);
  });
  it("manager discretion is plus or minus the policy percentage", () => {
    expect(bonusWithinDiscretion(100000, 109000, 10)).toBe(true);
    expect(bonusWithinDiscretion(100000, 111000, 10)).toBe(false);
  });
});

describe("eligibility", () => {
  const base = {
    status: "Active",
    employmentType: "Permanent",
    dateOfHire: "2020-01-15",
    probationEndDate: null,
    scorePct: 85,
    hasOpenDiscipline: false,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    asOf: "2026-12-31",
  };
  it("is fully eligible for a long-serving, active, reviewed employee", () => {
    const r = checkEligibility(base, P);
    expect(r.result).toBe("eligible");
    expect(r.factor).toBe(1);
  });
  it("excludes when no locked review exists and says it is missing evidence", () => {
    const r = checkEligibility({ ...base, scorePct: null }, P);
    expect(r.result).toBe("excluded");
    expect(r.missingEvidence).toBe(true);
  });
  it("excludes below the minimum score, with an open case, on probation and when not active", () => {
    expect(checkEligibility({ ...base, scorePct: 55 }, P).result).toBe("excluded");
    expect(checkEligibility({ ...base, hasOpenDiscipline: true }, P).result).toBe("excluded");
    expect(checkEligibility({ ...base, probationEndDate: "2027-01-01" }, P).result).toBe("excluded");
    expect(checkEligibility({ ...base, status: "Terminated" }, P).result).toBe("excluded");
  });
  it("prorates a joiner by months served over months in the period", () => {
    const r = checkEligibility({ ...base, dateOfHire: "2026-04-01", asOf: "2026-12-31" }, { ...P, eligibility: { ...P.eligibility, minServiceMonths: 6 } });
    expect(r.result).toBe("prorated");
    expect(r.factor).toBe(0.75); // April-December = 9 of 12
  });
  it("counts completed months only", () => {
    expect(completedMonths("2026-01-15", "2026-02-14")).toBe(0);
    expect(completedMonths("2026-01-15", "2026-02-15")).toBe(1);
  });
});

describe("incentive schemes", () => {
  it("pays nothing below the threshold", () => {
    const r = computeSchemePayout({ config: { payout: "pct_of_result", pct: 5, threshold: 100000 }, metricValue: 90000, monthlySalary: 0, eligibilityFactor: 1 });
    expect(r.amount).toBe(0);
    expect(r.belowThreshold).toBe(true);
  });
  it("pays a percentage of the result with cap and floor", () => {
    const cfg = { payout: "pct_of_result" as const, pct: 5, cap: 40000, floor: 5000 };
    expect(computeSchemePayout({ config: cfg, metricValue: 500000, monthlySalary: 0, eligibilityFactor: 1 }).amount).toBe(25000);
    expect(computeSchemePayout({ config: cfg, metricValue: 2000000, monthlySalary: 0, eligibilityFactor: 1 }).capped).toBe(true);
    expect(computeSchemePayout({ config: cfg, metricValue: 40000, monthlySalary: 0, eligibilityFactor: 1 }).amount).toBe(5000);
  });
  it("pays tiered slabs on the slice inside each tier", () => {
    const cfg = { payout: "tiered" as const, tiers: [{ from: 0, to: 100000, pct: 2 }, { from: 100000, to: null, pct: 5 }] };
    expect(computeSchemePayout({ config: cfg, metricValue: 300000, monthlySalary: 0, eligibilityFactor: 1 }).amount).toBe(12000); // 2,000 + 10,000
  });
  it("supports flat and percent-of-salary payouts", () => {
    expect(computeSchemePayout({ config: { payout: "flat", amount: 15000 }, metricValue: 0, monthlySalary: 0, eligibilityFactor: 1 }).amount).toBe(15000);
    expect(computeSchemePayout({ config: { payout: "pct_of_salary", pct: 10 }, metricValue: 0, monthlySalary: 80000, eligibilityFactor: 1 }).amount).toBe(8000);
  });
});

describe("policy validation", () => {
  it("accepts the defaults", () => expect(validatePolicy(P)).toBeNull());
  it("refuses weights that do not total 100", () => {
    expect(validatePolicy({ ...P, scoreWeights: { ...P.scoreWeights, kpi: 40 } })).toMatch(/total 100/);
  });
  it("refuses a band with no merit row", () => {
    expect(validatePolicy({ ...P, bands: [{ min: 50, rating: "Fine", factor: 1 }, { min: 0, rating: "Does Not Meet", factor: 0 }] })).toMatch(/no row/);
  });
});
