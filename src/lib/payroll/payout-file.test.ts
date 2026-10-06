import { describe, expect, it } from "vitest";
import { buildBankFile, buildMpesaFile, normalizeKenyanMobile, type PayoutLine } from "./payout-file";

const line = (o: Partial<PayoutLine> = {}): PayoutLine => ({
  staffNo: "E001", name: "Jane Doe", net: 50000, phone: "0712345678",
  bankName: "KCB", accountNo: "1234567890", branchCode: "01", ...o,
});

describe("normalizeKenyanMobile", () => {
  it("normalises common formats", () => {
    for (const v of ["0712345678", "+254712345678", "254712345678", "712345678", "0712 345 678", "0712-345-678"]) {
      expect(normalizeKenyanMobile(v)).toBe("254712345678");
    }
    expect(normalizeKenyanMobile("0112345678")).toBe("254112345678");
  });
  it("rejects bad numbers", () => {
    for (const v of [null, "", "12345", "0212345678", "07123456789", "abc", "+255712345678"]) {
      expect(normalizeKenyanMobile(v)).toBeNull();
    }
  });
});

describe("buildMpesaFile", () => {
  it("builds rows and total, skipping people we cannot pay", () => {
    const f = buildMpesaFile([line(), line({ staffNo: "E002", phone: null }), line({ staffNo: "E003", phone: "999" }), line({ staffNo: "E004", net: 0 })], "2026-09");
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]).toMatchObject({ phone: "254712345678", amount: 50000, reference: "Salary 2026-09" });
    expect(f.total).toBe(50000);
    expect(f.exceptions.map((e) => e.staff_no)).toEqual(["E002", "E003", "E004"]);
  });
});

describe("buildBankFile", () => {
  it("skips missing bank details and rounds to cents", () => {
    const f = buildBankFile([line({ net: 100.005 }), line({ staffNo: "E002", accountNo: " " }), line({ staffNo: "E003", bankName: null })], "2026-09");
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0].amount).toBe(100.01);
    expect(f.exceptions).toHaveLength(2);
  });
  it("strips spaces inside account numbers", () => {
    expect(buildBankFile([line({ accountNo: "12 34 56" })], "p").rows[0].account_no).toBe("123456");
  });
});
