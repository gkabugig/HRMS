// Kenyan statutory payroll calculations.
// Ported from the client-side prototype's computePayslip()/calcPAYE()/etc.
// Rates are passed in (read from the `statutory_rates` table for the run's period)
// rather than hardcoded, so they can change over time without a code deploy.

export type PayeBand = { upto: number | null; rate: number };

export type StatutoryRates = {
  paye_bands: PayeBand[];
  personal_relief: number;
  nssf_tier1_ceiling: number;
  nssf_tier2_ceiling: number;
  nssf_rate: number;
  shif_rate: number;
  shif_min: number;
  housing_levy_rate: number;
};

export type EmployeeComp = {
  basic: number;
  house_allowance: number;
  transport_allowance: number;
  other_allowance: number;
  other_deductions: number;
};

export function grossOf(emp: EmployeeComp): number {
  return (
    (emp.basic || 0) +
    (emp.house_allowance || 0) +
    (emp.transport_allowance || 0) +
    (emp.other_allowance || 0)
  );
}

export function calcNSSF(gross: number, rates: StatutoryRates) {
  const tier1Pensionable = Math.min(gross, rates.nssf_tier1_ceiling);
  const tier2Pensionable = Math.max(
    0,
    Math.min(gross, rates.nssf_tier2_ceiling) - rates.nssf_tier1_ceiling
  );
  const employee = (tier1Pensionable + tier2Pensionable) * rates.nssf_rate;
  return { employee, employer: employee }; // employer matches employee contribution
}

export function calcSHIF(gross: number, rates: StatutoryRates) {
  return Math.max(gross * rates.shif_rate, rates.shif_min);
}

export function calcHousingLevy(gross: number, rates: StatutoryRates) {
  const employee = gross * rates.housing_levy_rate;
  return { employee, employer: employee };
}

export function calcPAYE(taxable: number, rates: StatutoryRates): number {
  let remaining = taxable;
  let tax = 0;
  let lowerBound = 0;

  for (const band of rates.paye_bands) {
    const upto = band.upto === null ? Infinity : band.upto;
    const bandWidth = upto - lowerBound;
    const taxableInBand = Math.max(0, Math.min(remaining, bandWidth));
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
    lowerBound = upto;
    if (remaining <= 0) break;
  }

  return Math.max(0, tax - rates.personal_relief);
}

export type Payslip = {
  gross: number;
  nssf: number;
  shif: number;
  housing_levy: number;
  paye: number;
  other_deductions: number;
  net: number;
  employer_nssf: number;
  employer_housing_levy: number;
  leave_deduction: number;
  advance_applied: number;
  deduction_capped: boolean;
};

// Employment Act s.30: 7 days full pay + 7 days half pay per 12-month
// service window, after 2 months' service. Given how many sick days an
// employee has already used in the trailing 12-month window *before* this
// pay period, and how many fall inside this period, returns the amount to
// subtract from gross pay (not a s.19 "deduction" — it's wages not earned,
// so it comes off gross before any statutory calculation, and isn't subject
// to the two-thirds deduction cap below).
export function sickLeavePayReduction(
  daysAlreadyUsedInWindow: number,
  sickDaysThisPeriod: number,
  dailyRate: number
): number {
  const FULL_PAY_DAYS = 7;
  const HALF_PAY_DAYS = 7;
  let reduction = 0;
  for (let i = 0; i < sickDaysThisPeriod; i++) {
    const dayIndex = daysAlreadyUsedInWindow + i; // 0-based cumulative count
    if (dayIndex < FULL_PAY_DAYS) continue; // full pay, nothing withheld
    if (dayIndex < FULL_PAY_DAYS + HALF_PAY_DAYS) reduction += dailyRate * 0.5;
    else reduction += dailyRate; // beyond 14 days: unpaid
  }
  return Math.round(reduction * 100) / 100;
}

export function computePayslip(
  emp: EmployeeComp,
  rates: StatutoryRates,
  advanceRequested = 0,
  unpaidLeaveReduction = 0
): Payslip {
  const fullGross = grossOf(emp);
  const gross = Math.max(0, fullGross - unpaidLeaveReduction);
  const nssf = calcNSSF(gross, rates);
  const shif = calcSHIF(gross, rates);
  const housing = calcHousingLevy(gross, rates);
  const taxable = gross - nssf.employee; // NSSF is deductible before PAYE
  const paye = calcPAYE(taxable, rates);
  const statutoryTotal = nssf.employee + shif + housing.employee + paye;

  // s.19(1)(h): loan/salary-advance repayments are capped at 50% of wages.
  const advanceCapped = Math.min(advanceRequested, gross * 0.5);

  const otherDeductions = emp.other_deductions || 0;
  const discretionaryRequested = otherDeductions + advanceCapped;

  // s.19(3): total deductions (in aggregate) may not exceed two-thirds of
  // wages. Statutory deductions aren't reducible, so the cap applies to
  // whatever room is left after them. `other_deductions` (one-off, HR
  // entered) is protected first; a salary advance is reduced first if
  // there isn't room for both, since its balance simply carries to the
  // next payroll run.
  const cap = gross * (2 / 3);
  const room = Math.max(0, cap - statutoryTotal);
  const discretionaryApplied = Math.min(discretionaryRequested, room);
  const otherApplied = Math.min(otherDeductions, discretionaryApplied);
  const advanceApplied = discretionaryApplied - otherApplied;
  const deductionCapped = discretionaryApplied < discretionaryRequested;

  const net = gross - statutoryTotal - discretionaryApplied;

  return {
    gross,
    nssf: nssf.employee,
    shif,
    housing_levy: housing.employee,
    paye,
    other_deductions: otherApplied,
    net,
    employer_nssf: nssf.employer,
    employer_housing_levy: housing.employer,
    leave_deduction: unpaidLeaveReduction,
    advance_applied: advanceApplied,
    deduction_capped: deductionCapped,
  };
}
