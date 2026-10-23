import { describe, expect, it } from "vitest";
import {
  cashVariance,
  eveningSummaryMessages,
  isReportLate,
  morningAlertMessage,
  morningExceptions,
  nextKioskActions,
  normaliseKenyanMsisdn,
  parseAmount,
  parseCount,
  varianceFlagged,
  type RosterPerson,
} from "./rules";
import { hashPin, newPairingCode, normalisePairingCode, pinProblem, verifyPin } from "./secrets";

describe("nextKioskActions", () => {
  it("only offers clock in before arrival", () => {
    expect(nextKioskActions({ clockIn: null, clockOut: null, onBreak: false })).toEqual(["clock_in"]);
  });
  it("offers lunch or clock out while working", () => {
    expect(nextKioskActions({ clockIn: "08:02", clockOut: null, onBreak: false })).toEqual(["start_lunch", "clock_out"]);
  });
  it("only offers return while at lunch, so nobody clocks out mid-break", () => {
    expect(nextKioskActions({ clockIn: "08:02", clockOut: null, onBreak: true })).toEqual(["end_lunch"]);
  });
  it("offers nothing once clocked out", () => {
    expect(nextKioskActions({ clockIn: "08:02", clockOut: "22:01", onBreak: false })).toEqual([]);
  });
});

describe("cash", () => {
  it("is zero when the till balances", () => {
    expect(cashVariance({ openingFloat: 2000, cashSales: 15000, pettyCash: 500, cashBanked: 10000, closingCash: 6500 })).toBe(0);
  });
  it("is negative when cash is short", () => {
    expect(cashVariance({ openingFloat: 2000, cashSales: 15000, pettyCash: 500, cashBanked: 10000, closingCash: 5800 })).toBe(-700);
  });
  it("flags only beyond the threshold", () => {
    expect(varianceFlagged(-500, 500)).toBe(false);
    expect(varianceFlagged(-500.01, 500)).toBe(true);
    expect(varianceFlagged(600, 500)).toBe(true);
  });
  it("parses money and counts as typed", () => {
    expect(parseAmount("1,250.50")).toBe(1250.5);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseCount("12")).toBe(12);
    expect(parseCount("1.5")).toBeNull();
  });
});

describe("isReportLate", () => {
  it("uses the 10:30 pm deadline on the report's own date", () => {
    expect(isReportLate("2026-10-23", "22:30", { date: "2026-10-23", time: "22:30" })).toBe(false);
    expect(isReportLate("2026-10-23", "22:30", { date: "2026-10-23", time: "22:31" })).toBe(true);
  });
  it("treats anything sent the next day as late", () => {
    expect(isReportLate("2026-10-23", "22:30", { date: "2026-10-24", time: "00:05" })).toBe(true);
  });
});

const person = (over: Partial<RosterPerson>): RosterPerson => ({
  employeeId: "e",
  name: "Staff",
  branchId: "b1",
  shiftStart: "08:00",
  graceMinutes: 15,
  onLeave: false,
  clockIn: null,
  clockOut: null,
  ...over,
});

describe("morningExceptions", () => {
  const branches = [
    { id: "b1", name: "Branch 001" },
    { id: "b2", name: "Branch 002" },
  ];

  it("counts 8:15 as on time and 8:16 as late", () => {
    const [b1] = morningExceptions(branches, [person({ employeeId: "a", clockIn: "08:15" }), person({ employeeId: "b", name: "Jane", clockIn: "08:16" })], "08:20");
    expect(b1.late.map((l) => l.employeeId)).toEqual(["b"]);
    expect(b1.late[0].minutesLate).toBe(16);
    expect(b1.present).toBe(2);
  });

  it("does not expect people on leave and flags a branch nobody has opened", () => {
    const res = morningExceptions(branches, [person({ employeeId: "a", onLeave: true }), person({ employeeId: "c", branchId: "b2" })], "08:20");
    expect(res[0].expected).toBe(0);
    expect(res[0].notOpen).toBe(false);
    expect(res[1].notOpen).toBe(true);
    expect(res[1].absent).toHaveLength(1);
  });

  it("does not call someone absent before their grace period ends", () => {
    const [b1] = morningExceptions(branches, [person({ employeeId: "a", shiftStart: "09:00" })], "08:20");
    expect(b1.absent).toHaveLength(0);
  });

  it("writes one line per branch with something to say", () => {
    const [b1] = morningExceptions(branches, [person({ employeeId: "a", name: "Ann", clockIn: "08:40" }), person({ employeeId: "b", name: "Bob" })], "08:20");
    expect(morningAlertMessage(b1)).toBe("Branch 001 (1/2 in) - late: Ann 08:40 (+40 min); not in: Bob.");
  });
});

describe("eveningSummaryMessages", () => {
  it("lists missing reports and cash problems without line breaks", () => {
    const msgs = eveningSummaryMessages(
      "2026-10-23",
      [
        { branchName: "Branch 001", reportIn: true, reportLate: false, totalSales: 120000, variance: -800, present: 5, expected: 5, lateCount: 1 },
        { branchName: "Branch 002", reportIn: false, reportLate: false, totalSales: null, variance: null, present: 4, expected: 4, lateCount: 0 },
      ],
      500
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("1/2 reports in");
    expect(msgs[0]).toContain("MISSING: Branch 002");
    expect(msgs[0]).toContain("CASH SHORT KES 800");
    expect(msgs[0]).not.toMatch(/\n/);
  });

  it("splits long summaries into messages under the limit", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ branchName: `Branch 00${i}`, reportIn: true, reportLate: true, totalSales: 99999, variance: 0, present: 6, expected: 7, lateCount: 2 }));
    const msgs = eveningSummaryMessages("2026-10-23", rows, 500, 200);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(200);
  });
});

describe("phone numbers", () => {
  it("normalises Kenyan mobile numbers for WhatsApp", () => {
    expect(normaliseKenyanMsisdn("0712 345 678")).toBe("254712345678");
    expect(normaliseKenyanMsisdn("+254 112 345 678")).toBe("254112345678");
    expect(normaliseKenyanMsisdn("12345")).toBeNull();
  });
});

describe("secrets", () => {
  it("round-trips a pairing code typed loosely", () => {
    const code = newPairingCode();
    expect(normalisePairingCode(code.toLowerCase().replace("-", " "))).toBe(code);
    expect(normalisePairingCode("O0O0-1111")).toBeNull();
  });
  it("rejects weak or malformed PINs", () => {
    expect(pinProblem("1234")).not.toBeNull();
    expect(pinProblem("12a4")).not.toBeNull();
    expect(pinProblem("4829")).toBeNull();
  });
  it("verifies a PIN against its salted hash", async () => {
    const h = await hashPin("4829");
    expect(h).not.toContain("4829");
    expect(await verifyPin("4829", h)).toBe(true);
    expect(await verifyPin("4828", h)).toBe(false);
  });
});
