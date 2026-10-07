import { describe, expect, it } from "vitest";
import { buildReport, reportCsv, type RepRow, type ReportInput } from "./report-engine";

const row = (o: Partial<RepRow>): RepRow => ({ recId: "r", cycleId: "c", employeeId: "e", name: "A", department: "Ops", managerName: "M", grade: "G1", rating: "Meets", type: "merit", status: "Finalised", calculated: 100, recommended: 100, pct: 5, isException: false, justification: null, schemeName: null, poolId: "p1", excluded: false, ...o });
const input = (rows: RepRow[]): ReportInput => ({ rows, txs: [], pools: [{ id: "p1", name: "Merit pool", type: "merit", budget: 1000 }], cases: [], ratingOrder: ["Exceptional", "Meets"] });

describe("reports", () => {
  it("splits pool usage by state and reconciles to the budget", () => {
    const r = buildReport("pools", input([row({ status: "Open", recommended: 200 }), row({ status: "Finalised", recommended: 300 }), row({ status: "Paid", recommended: 100 })]));
    expect(r.sections[0].rows[0]).toEqual(["Merit pool", "merit", 1000, 200, 300, 100, 400, "60%"]);
  });
  it("averages merit by rating", () => {
    const r = buildReport("merit", input([row({ pct: 4 }), row({ pct: 6 })]));
    expect(r.sections[0].rows[0]).toEqual(["Meets", 2, 5, 100, 200]);
  });
  it("history totals come from the transactions given", () => {
    const i = input([]);
    i.txs = [
      { employeeId: "e", name: "A", department: "Ops", type: "earning", amount: 5000, effective: "2026-10-01", status: "pending" },
      { employeeId: "e", name: "A", department: "Ops", type: "salary_change", amount: 3000, effective: "2026-10-01", status: "pending" },
    ];
    expect(buildReport("history", i).sections[0].rows[0]).toEqual([5000, 3000, 2]);
  });
  it("neutralises spreadsheet formulas in CSV", () => {
    const r = buildReport("exceptions", input([row({ isException: true, justification: "=HYPERLINK(1)" })]));
    expect(reportCsv(r)).toContain("\"'=HYPERLINK(1)\"");
  });
});
