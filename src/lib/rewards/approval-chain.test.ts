import { describe, expect, it } from "vitest";
import { pickWorkflow, resolveStages, type Workflow } from "./approval-chain";

const w = (o: Partial<Workflow>): Workflow => ({ id: "w", name: "w", reward_type: "*", min_amount: 0, max_amount: null, exceptions_only: false, stages: ["hr"], due_days: 3, ...o });

describe("approval chains", () => {
  it("prefers a named type, then the higher minimum", () => {
    const list = [w({ id: "any" }), w({ id: "big", min_amount: 500000 }), w({ id: "bonus", reward_type: "bonus" })];
    expect(pickWorkflow(list, { rewardType: "bonus", amount: 600000, isException: false })?.id).toBe("bonus");
    expect(pickWorkflow(list, { rewardType: "merit", amount: 600000, isException: false })?.id).toBe("big");
    expect(pickWorkflow(list, { rewardType: "merit", amount: 100, isException: false })?.id).toBe("any");
  });
  it("respects max amount and exceptions-only", () => {
    const list = [w({ id: "small", max_amount: 1000 }), w({ id: "exc", exceptions_only: true })];
    expect(pickWorkflow(list, { rewardType: "merit", amount: 5000, isException: false })).toBeNull();
    expect(pickWorkflow(list, { rewardType: "merit", amount: 5000, isException: true })?.id).toBe("exc");
  });
  it("never lets the submitter approve", () => {
    expect(resolveStages(["hr", "head"], { submitterRole: "hr", submitterUserId: "u1", headUserId: "h", isException: false, hasWorkflow: true })).toEqual([{ approverRole: "admin" }, { approverUserId: "h" }]);
    expect(resolveStages(["hr", "head"], { submitterRole: "manager", submitterUserId: "h", headUserId: "h", isException: false, hasWorkflow: true })).toEqual([{ approverRole: "hr" }]);
  });
  it("adds the head to exceptions when no workflow is configured", () => {
    expect(resolveStages(["hr"], { submitterRole: "manager", submitterUserId: "m", headUserId: "h", isException: true, hasWorkflow: false })).toEqual([{ approverRole: "hr" }, { approverUserId: "h" }]);
  });
});
