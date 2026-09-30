// Pure helper functions for Employment Act, 2007 compliance calculations.
// Kept out of any "use server" file, since a Server Actions file may only
// export async server actions.

// s.42: initial probation is capped at 6 months.
export function defaultProbationEndDate(dateOfHire: string): string {
  const d = new Date(dateOfHire);
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

// s.40(1)(g): severance pay of not less than 15 days' pay per completed
// year of service. Daily rate follows the same monthly-salary ÷ 26
// convention used for annual leave payout.
export function calcSeverancePay(basicSalary: number, dateOfHire: string, lastWorkingDay: string): number {
  const yearsCompleted = Math.floor(daysBetween(dateOfHire, lastWorkingDay) / 365.25);
  if (yearsCompleted <= 0) return 0;
  const dailyRate = basicSalary / 26;
  return Math.round(dailyRate * 15 * yearsCompleted * 100) / 100;
}
