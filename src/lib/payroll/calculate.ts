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
};

export function computePayslip(
  emp: EmployeeComp,
  rates: StatutoryRates,
  advanceDeduction = 0
): Payslip {
  const gross = grossOf(emp);
  const nssf = calcNSSF(gross, rates);
  const shif = calcSHIF(gross, rates);
  const housing = calcHousingLevy(gross, rates);
  const taxable = gross - nssf.employee; // NSSF is deductible before PAYE
  const paye = calcPAYE(taxable, rates);
  const otherDeductions = (emp.other_deductions || 0) + advanceDeduction;
  const net = gross - nssf.employee - shif - housing.employee - paye - otherDeductions;

  return {
    gross,
    nssf: nssf.employee,
    shif,
    housing_levy: housing.employee,
    paye,
    other_deductions: otherDeductions,
    net,
    employer_nssf: nssf.employer,
    employer_housing_levy: housing.employer,
  };
}
