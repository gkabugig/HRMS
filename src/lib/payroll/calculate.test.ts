import { describe, expect, it } from "vitest";
import {
  calcHousingLevy,
  calcNSSF,
  calcPAYE,
  calcSHIF,
  computePayslip,
  grossOf,
  sickLeavePayReduction,
  type StatutoryRates,
} from "./calculate";

// The org's actual seeded rates (supabase/migrations/0003_bootstrap_and_seed.sql)
// rather than invented numbers, so these tests exercise the real Kenyan
// statutory bands this app runs in production.
const RATES: StatutoryRates = {
  paye_bands: [
    { upto: 24000, rate: 0.1 },
    { upto: 32333, rate: 0.25 },
    { upto: 500000, rate: 0.3 },
    { upto: 800000, rate: 0.325 },
    { upto: null, rate: 0.35 },
  ],
  personal_relief: 2400,
  nssf_tier1_ceiling: 8000,
  nssf_tier2_ceiling: 72000,
  nssf_rate: 0.06,
  shif_rate: 0.0275,
  shif_min: 300,
  housing_levy_rate: 0.015,
};

describe("grossOf", () => {
  it("sums basic plus all three allowances", () => {
    expect(grossOf({ basic: 40000, house_allowance: 10000, transport_allowance: 5000, other_allowance: 2000, other_deductions: 0 })).toBe(57000);
  });

  it("treats missing/zero components as 0 rather than throwing", () => {
    expect(grossOf({ basic: 0, house_allowance: 0, transport_allowance: 0, other_allowance: 0, other_deductions: 0 })).toBe(0);
  });
});

describe("calcNSSF", () => {
  it("charges only tier 1 when gross is below the tier-1 ceiling", () => {
    // gross 5,000 < 8,000 ceiling: tier1Pensionable = 5,000, tier2 = 0
    expect(calcNSSF(5000, RATES)).toEqual({ employee: 300, employer: 300 });
  });

  it("adds tier 2 once gross passes the tier-1 ceiling", () => {
    // gross 50,000: tier1 = 8,000, tier2 = min(50000,72000) - 8000 = 42,000 -> pensionable 50,000
    expect(calcNSSF(50000, RATES)).toEqual({ employee: 3000, employer: 3000 });
  });

  it("caps pensionable pay at the tier-2 ceiling for high earners", () => {
    // gross 600,000: pensionable capped at 72,000 regardless of how far gross exceeds it.
    // Matches the live payslip for the 600,000-gross employee (NSSF 4,320).
    expect(calcNSSF(600000, RATES)).toEqual({ employee: 4320, employer: 4320 });
  });

  it("employer always matches the employee amount", () => {
    const { employee, employer } = calcNSSF(123456, RATES);
    expect(employer).toBe(employee);
  });
});

describe("calcSHIF", () => {
  it("applies the percentage rate when it exceeds the minimum", () => {
    // Matches the live payslips: 600,000 * 2.75% = 16,500; 580,000 * 2.75% = 15,950
    expect(calcSHIF(600000, RATES)).toBe(16500);
    expect(calcSHIF(580000, RATES)).toBeCloseTo(15950, 5);
  });

  it("falls back to the minimum when the percentage would be lower", () => {
    // 5,000 * 2.75% = 137.5, below the 300 floor
    expect(calcSHIF(5000, RATES)).toBe(300);
  });
});

describe("calcHousingLevy", () => {
  it("charges 1.5% of gross and has the employer match it", () => {
    // Matches the live payslips: 600,000 -> 9,000; 580,000 -> 8,700
    expect(calcHousingLevy(600000, RATES)).toEqual({ employee: 9000, employer: 9000 });
    expect(calcHousingLevy(580000, RATES)).toEqual({ employee: 8700, employer: 8700 });
  });
});

describe("calcPAYE", () => {
  it("returns 0 when relief fully absorbs the tax on low taxable pay", () => {
    // 20,000 entirely in the 10% band: tax = 2,000, relief 2,400 wipes it out.
    expect(calcPAYE(20000, RATES)).toBe(0);
  });

  it("never goes negative when relief exceeds the computed tax", () => {
    expect(calcPAYE(0, RATES)).toBe(0);
  });

  it("spans multiple bands correctly", () => {
    // 30,000: 24,000 @ 10% = 2,400; remaining 6,000 @ 25% = 1,500 -> 3,900 - 2,400 relief = 1,500
    expect(calcPAYE(30000, RATES)).toBeCloseTo(1500, 5);
  });

  it("spans three bands correctly", () => {
    // 50,000: 24,000@10%=2,400; 8,333@25%=2,083.25; remaining 17,667@30%=5,300.10
    // total tax 9,783.35 - 2,400 relief = 7,383.35
    expect(calcPAYE(50000, RATES)).toBeCloseTo(7383.35, 2);
  });

  it("reaches the top (null-upto) band for very high taxable pay", () => {
    // 1,000,000 taxable: bands up to 800,000 contribute 242,283.35; the
    // remaining 200,000 is taxed at the top 35% band -> +70,000 = 312,283.35
    // minus the 2,400 relief = 309,883.35
    expect(calcPAYE(1000000, RATES)).toBeCloseTo(309883.35, 2);
  });
});

describe("sickLeavePayReduction", () => {
  const dailyRate = 1000;

  it("charges nothing for the first 7 days used in the trailing window", () => {
    expect(sickLeavePayReduction(0, 3, dailyRate)).toBe(0);
    expect(sickLeavePayReduction(0, 7, dailyRate)).toBe(0);
  });

  it("charges half pay for days 8-14 of the window", () => {
    // Already used 5 days; this period adds 5 more (indices 5-9): days 5,6
    // are still full pay, days 7,8,9 are half pay -> 3 * 500 = 1,500
    expect(sickLeavePayReduction(5, 5, dailyRate)).toBe(1500);
  });

  it("charges full unpaid rate beyond day 14", () => {
    // Already used 12; this period adds 5 (indices 12-16): 12,13 half pay
    // (1,000), 14,15,16 unpaid (3,000) -> 4,000 total
    expect(sickLeavePayReduction(12, 5, dailyRate)).toBe(4000);
  });
});

describe("computePayslip", () => {
  it("computes a straightforward payslip with no caps or leave", () => {
    const result = computePayslip(
      { basic: 40000, house_allowance: 10000, transport_allowance: 5000, other_allowance: 0, other_deductions: 0 },
      RATES
    );
    expect(result.gross).toBe(55000);
    expect(result.nssf).toBe(3300); // 55,000 all pensionable (tier1+tier2 = gross here) * 6%
    expect(result.shif).toBeCloseTo(1512.5, 5);
    expect(result.housing_levy).toBeCloseTo(825, 5);
    expect(result.paye).toBeCloseTo(7893.35, 2);
    expect(result.net).toBeCloseTo(41469.15, 2);
    expect(result.employer_nssf).toBe(result.nssf);
    expect(result.employer_housing_levy).toBeCloseTo(result.housing_levy, 5);
    expect(result.deduction_capped).toBe(false);
  });

  it("enforces the Employment Act s.19(3) two-thirds deduction cap", () => {
    // gross 20,000 with 15,000 of other_deductions requested - statutory
    // deductions alone leave only ~11,283.33 of room under the 2/3 cap.
    const result = computePayslip({ basic: 20000, house_allowance: 0, transport_allowance: 0, other_allowance: 0, other_deductions: 15000 }, RATES);
    expect(result.deduction_capped).toBe(true);
    expect(result.other_deductions).toBeCloseTo(11283.33, 1);
    expect(result.net).toBeCloseTo(6666.67, 1);
  });

  it("caps a salary advance at 50% of gross under s.19(1)(h), independent of the s.19(3) flag", () => {
    // advance requested (20,000) exceeds 50% of gross (15,000), so only
    // 15,000 is actually applied - but since there's still room under the
    // two-thirds cap, deduction_capped itself stays false: that flag is
    // specific to the aggregate s.19(3) cap, not the per-advance s.19(1)(h) one.
    const result = computePayslip({ basic: 30000, house_allowance: 0, transport_allowance: 0, other_allowance: 0, other_deductions: 0 }, RATES, 20000);
    expect(result.advance_applied).toBe(15000);
    expect(result.deduction_capped).toBe(false);
    expect(result.net).toBe(10875);
  });

  it("reduces gross pay for unpaid sick leave before any statutory calculation", () => {
    const result = computePayslip({ basic: 30000, house_allowance: 0, transport_allowance: 0, other_allowance: 0, other_deductions: 0 }, RATES, 0, 5000);
    expect(result.gross).toBe(25000);
    expect(result.leave_deduction).toBe(5000);
  });
});
