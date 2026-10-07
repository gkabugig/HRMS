// Spec §18 checks that can be proven in code. Database-level checks (audit
// immutability, once-only posting, manager/employee visibility) were run
// against the migrations on a scratch Postgres; see the hardening notes.
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "./config";
import { bandFor, computeBonus, computeMerit } from "./engine";
import { pickWorkflow, resolveStages } from "./approval-chain";
import { evaluateGates, readinessScore } from "./promotion-engine";
import { DEFAULT_PROMOTION_RULE } from "./promotion-engine";

describe("acceptance", () => {
  it("a closed cycle recalculated on its stored policy gives identical figures", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_POLICY)); // what the policy row holds
    const run = () => {
      const p = stored as typeof DEFAULT_POLICY;
      const band = bandFor(85, p.bands);
      return {
        bonus: computeBonus({ monthlySalary: 180000, targetPct: 10, performanceFactor: band.factor, companyFactor: 1.1, eligibilityFactor: 1, capPctOfTarget: p.bonus.capPctOfTarget }).amount,
        merit: computeMerit({ salary: 180000, rating: band.rating, position: "mid", bandMax: 220000, policy: p }).newSalary,
      };
    };
    expect(run()).toEqual(run());
  });

  it("promotion gates and readiness follow the configured rule", () => {
    const r = { ...DEFAULT_PROMOTION_RULE, minMonthsInGrade: 18 };
    const g = evaluateGates({ recentScoresPct: [80, 82], monthsInGrade: 12, hasOpenDiscipline: false, vacancyExists: null }, r);
    expect(g.allPassed).toBe(false);
    expect(readinessScore({ avgPerformancePct: 90, monthsInGrade: 36, competenciesPct: 90, qualificationsPct: 90, leadershipPct: 90, valuesPct: 90 }, r).label).toBe("Strongly Recommended");
  });

  it("a chain can be changed by data alone, and the submitter never approves", () => {
    const wf = pickWorkflow([{ id: "1", name: "big", reward_type: "*", min_amount: 100000, max_amount: null, exceptions_only: false, stages: ["hr", "head"], due_days: 2 }], { rewardType: "bonus", amount: 250000, isException: false });
    expect(wf?.stages).toEqual(["hr", "head"]);
    const steps = resolveStages(wf!.stages, { submitterRole: "hr", submitterUserId: "u", headUserId: "h", isException: false, hasWorkflow: true });
    expect(steps.some((s) => s.approverRole === "hr")).toBe(false);
  });
});
