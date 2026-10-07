import { describe, expect, it } from "vitest";
import { earningLetter, meritLetter } from "./reward-letter";

describe("reward letters", () => {
  it("merges the merit figures", () => {
    const l = meritLetter({ name: "Amina", pct: 5.5, oldSalary: 100000, newSalary: 105500, effective: "2026-07-01", orgName: "SKMG" });
    expect(l.body).toContain("5.5%");
    expect(l.body).toContain("KES 105,500");
    expect(l.body).toContain("2026-07-01");
  });
  it("states the tax treatment on earnings", () => {
    const l = earningLetter({ name: "Joe", type: "spot", amount: 5000, payPeriod: "2026-10", orgName: "SKMG" });
    expect(l.title).toBe("Your spot award");
    expect(l.body).toContain("PAYE");
  });
});
