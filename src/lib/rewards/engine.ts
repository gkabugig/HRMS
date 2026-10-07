// Pure reward calculations (spec §11). No database, no clock: everything a
// result depends on is passed in, so a recommendation can store its inputs
// as a snapshot and be reproduced exactly later.
import type { MeritCell, PerformanceBand, RangePosition, RewardPolicyConfig } from "./config";

export function roundMoney(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// Appraisals store a 0-5 score; the reward policy works in percentages.
export function scoreToPct(score: number, scaleMax = 5): number {
  return roundMoney((score / scaleMax) * 100, 1);
}

export function bandFor(scorePct: number, bands: PerformanceBand[]): PerformanceBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => scorePct >= b.min) ?? sorted[sorted.length - 1];
}

// Whole months between two ISO dates (completed months only).
export function completedMonths(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

export type EligibilityInput = {
  status: string; // employees.status
  employmentType: string;
  dateOfHire: string;
  probationEndDate: string | null;
  scorePct: number | null; // null = no locked review
  hasOpenDiscipline: boolean;
  periodStart: string;
  periodEnd: string;
  asOf: string; // payout / effective date
};

export type EligibilityResult = {
  result: "eligible" | "prorated" | "excluded";
  factor: number; // 0.00 - 1.00
  reasons: string[];
  missingEvidence: boolean;
};

export function checkEligibility(i: EligibilityInput, p: RewardPolicyConfig): EligibilityResult {
  const reasons: string[] = [];
  const excluded = (reason: string, missing = false): EligibilityResult => ({ result: "excluded", factor: 0, reasons: [...reasons, reason], missingEvidence: missing });

  if (i.scorePct === null) return excluded("No completed (locked) performance review for this cycle.", true);
  if (p.eligibility.requireActive && i.status !== "Active") return excluded(`Employment status is ${i.status}, not Active.`);
  if (i.scorePct < p.eligibility.minScorePct) return excluded(`Score ${i.scorePct}% is below the minimum ${p.eligibility.minScorePct}%.`);
  const types = p.eligibility.allowedEmploymentTypes;
  if (types.length > 0 && !types.includes(i.employmentType)) return excluded(`Contract type ${i.employmentType} is not covered.`);
  if (p.eligibility.blockOnOpenDiscipline && i.hasOpenDiscipline) return excluded("An open disciplinary case is held pending its outcome.");
  if (p.eligibility.requireConfirmed && i.probationEndDate && i.probationEndDate > i.asOf) return excluded("Still on probation on the payout date.");

  const service = completedMonths(i.dateOfHire, i.asOf);
  if (service < p.eligibility.minServiceMonths) return excluded(`Service of ${service} month(s) is below the minimum ${p.eligibility.minServiceMonths}.`);

  // Proration: months served in the period ÷ months in the period.
  const periodMonths = Math.max(1, completedMonths(i.periodStart, i.periodEnd) + 1);
  const start = i.dateOfHire > i.periodStart ? i.dateOfHire : i.periodStart;
  const served = Math.min(periodMonths, i.dateOfHire > i.periodStart ? completedMonths(start, i.periodEnd) + 1 : periodMonths);
  if (served < periodMonths) {
    return { result: "prorated", factor: roundMoney(served / periodMonths, 4), reasons: [...reasons, `Joined during the period: ${served} of ${periodMonths} months served.`], missingEvidence: false };
  }
  return { result: "eligible", factor: 1, reasons, missingEvidence: false };
}

export function rangePositionOf(salary: number, bandMin: number | null, bandMax: number | null, p: RewardPolicyConfig): { position: RangePosition; ratio: number | null } {
  if (bandMin === null || bandMax === null) return { position: "mid", ratio: null };
  const midpoint = (bandMin + bandMax) / 2;
  if (midpoint <= 0) return { position: "mid", ratio: null };
  const ratio = salary / midpoint;
  if (ratio < p.rangeCutoffs.belowUnder) return { position: "below", ratio };
  if (ratio > p.rangeCutoffs.aboveOver) return { position: "above", ratio };
  return { position: "mid", ratio };
}

export type MeritResult = {
  cell: MeritCell;
  proposedPct: number; // middle of the cell
  pct: number; // pct actually applied
  newSalary: number;
  increase: number;
  outsideRange: boolean;
  exceedsBandMax: boolean;
};

export function computeMerit(input: {
  salary: number;
  rating: string;
  position: RangePosition;
  bandMax: number | null;
  policy: RewardPolicyConfig;
  overridePct?: number | null; // manager's chosen figure
}): MeritResult {
  const row = input.policy.meritMatrix[input.rating];
  const cell = row ? row[input.position] : { min: 0, max: 0 };
  const proposedPct = (cell.min + cell.max) / 2;
  const pct = input.overridePct ?? proposedPct;
  const outsideRange = pct < cell.min || pct > cell.max;
  const newSalary = roundMoney(input.salary * (1 + pct / 100), input.policy.roundingDecimals);
  return {
    cell,
    proposedPct,
    pct,
    newSalary,
    increase: newSalary - input.salary,
    outsideRange,
    exceedsBandMax: input.bandMax !== null && newSalary > input.bandMax,
  };
}

export type BonusResult = {
  annualBase: number;
  targetBonus: number;
  uncapped: number;
  cap: number;
  amount: number;
  capped: boolean;
};

// Bonus = min(Target × F_performance × F_company/team × F_eligibility, Cap)
export function computeBonus(input: {
  monthlySalary: number;
  targetPct: number;
  performanceFactor: number;
  companyFactor: number;
  eligibilityFactor: number;
  capPctOfTarget: number;
  decimals?: number;
}): BonusResult {
  const d = input.decimals ?? 0;
  const annualBase = input.monthlySalary * 12;
  const targetBonus = annualBase * (input.targetPct / 100);
  const uncapped = targetBonus * input.performanceFactor * input.companyFactor * input.eligibilityFactor;
  const cap = targetBonus * (input.capPctOfTarget / 100);
  const amount = Math.min(uncapped, cap);
  return {
    annualBase,
    targetBonus: roundMoney(targetBonus, d),
    uncapped: roundMoney(uncapped, d),
    cap: roundMoney(cap, d),
    amount: roundMoney(amount, d),
    capped: uncapped > cap,
  };
}

// ---- Incentive schemes (spec §6) ----
export type Tier = { from: number; to: number | null; pct: number };

export type SchemeConfig = {
  payout: "flat" | "pct_of_salary" | "pct_of_result" | "tiered";
  amount?: number; // flat
  pct?: number; // pct_of_salary / pct_of_result
  tiers?: Tier[]; // tiered: pct applies to the slice of the result inside the tier
  threshold?: number; // minimum metric before anything is paid
  cap?: number | null;
  floor?: number | null;
};

export type SchemePayout = { amount: number; belowThreshold: boolean; capped: boolean; floored: boolean };

export function computeSchemePayout(input: { config: SchemeConfig; metricValue: number; monthlySalary: number; eligibilityFactor: number; decimals?: number }): SchemePayout {
  const { config, metricValue } = input;
  if (input.eligibilityFactor <= 0) return { amount: 0, belowThreshold: false, capped: false, floored: false };
  if (config.threshold !== undefined && metricValue < config.threshold) return { amount: 0, belowThreshold: true, capped: false, floored: false };

  let base = 0;
  switch (config.payout) {
    case "flat":
      base = config.amount ?? 0;
      break;
    case "pct_of_salary":
      base = input.monthlySalary * ((config.pct ?? 0) / 100);
      break;
    case "pct_of_result":
      base = metricValue * ((config.pct ?? 0) / 100);
      break;
    case "tiered":
      for (const t of config.tiers ?? []) {
        const upper = t.to ?? Infinity;
        const slice = Math.max(0, Math.min(metricValue, upper) - t.from);
        base += slice * (t.pct / 100);
      }
      break;
  }
  let amount = base * input.eligibilityFactor;
  let capped = false;
  let floored = false;
  if (config.cap != null && amount > config.cap) {
    amount = config.cap;
    capped = true;
  }
  if (config.floor != null && amount > 0 && amount < config.floor) {
    amount = config.floor;
    floored = true;
  }
  return { amount: roundMoney(amount, input.decimals ?? 0), belowThreshold: false, capped, floored };
}

// Manager discretion on a bonus: anywhere within ±discretionPct of the
// calculated figure; beyond that it is an exception (spec §19).
export function bonusWithinDiscretion(calculated: number, chosen: number, discretionPct: number): boolean {
  if (calculated === 0) return chosen === 0;
  const diff = Math.abs(chosen - calculated) / calculated;
  return diff <= discretionPct / 100 + 1e-9;
}
