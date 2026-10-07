// Promotion rules (spec §9): hard eligibility gates first, then a weighted
// readiness score ranks those who pass. Pure functions, no database.
import { completedMonths, roundMoney } from "./engine";

export type PromotionRuleConfig = {
  minPerformancePct: number; // each of the last N completed cycles must reach this
  performanceCycles: number; // N
  minMonthsInGrade: number;
  requireVacancy: boolean;
  upliftPct: number; // promotional uplift on current salary
  weights: { performance: number; competencies: number; experience: number; qualifications: number; leadership: number; values: number };
  cutoffs: { stronglyRecommended: number; recommended: number; developmentNeeded: number };
};

export const DEFAULT_PROMOTION_RULE: PromotionRuleConfig = {
  minPerformancePct: 70,
  performanceCycles: 2,
  minMonthsInGrade: 12,
  requireVacancy: false,
  upliftPct: 10,
  weights: { performance: 35, competencies: 20, experience: 15, qualifications: 10, leadership: 10, values: 10 },
  cutoffs: { stronglyRecommended: 80, recommended: 65, developmentNeeded: 50 },
};

export type Gate = { key: string; label: string; passed: boolean; detail: string; checked: boolean };

export type GateInput = {
  recentScoresPct: number[]; // newest first, completed reviews only
  monthsInGrade: number;
  hasOpenDiscipline: boolean;
  vacancyExists: boolean | null; // null = not checked
};

export function evaluateGates(i: GateInput, r: PromotionRuleConfig): { gates: Gate[]; allPassed: boolean } {
  const recent = i.recentScoresPct.slice(0, r.performanceCycles);
  const perfPassed = recent.length >= r.performanceCycles && recent.every((s) => s >= r.minPerformancePct);
  const gates: Gate[] = [
    {
      key: "performance",
      label: `Sustained performance (${r.minPerformancePct}%+ in the last ${r.performanceCycles} cycle${r.performanceCycles === 1 ? "" : "s"})`,
      passed: perfPassed,
      detail: recent.length < r.performanceCycles ? `Only ${recent.length} completed review(s) on file.` : `Scores: ${recent.map((s) => `${s}%`).join(", ")}.`,
      checked: true,
    },
    {
      key: "time_in_grade",
      label: `Time in current grade (${r.minMonthsInGrade}+ months)`,
      passed: i.monthsInGrade >= r.minMonthsInGrade,
      detail: `${i.monthsInGrade} month(s) in grade.`,
      checked: true,
    },
    { key: "training", label: "Required training or certification", passed: true, detail: "Not checked: the Learning module does not yet list required qualifications per role.", checked: false },
    { key: "conduct", label: "No active disciplinary case", passed: !i.hasOpenDiscipline, detail: i.hasOpenDiscipline ? "An open disciplinary case exists." : "Clear.", checked: true },
  ];
  if (r.requireVacancy) {
    gates.push({
      key: "position",
      label: "A vacant position exists at the target grade",
      passed: i.vacancyExists === true,
      detail: i.vacancyExists === true ? "A matching vacancy exists." : "No matching vacant position found.",
      checked: true,
    });
  }
  return { gates, allPassed: gates.every((g) => g.passed) };
}

export type ReadinessInput = {
  avgPerformancePct: number; // from locked scores
  monthsInGrade: number;
  competenciesPct: number; // manager / panel assessments, 0-100
  qualificationsPct: number;
  leadershipPct: number;
  valuesPct: number;
};

export type ReadinessLabel = "Strongly Recommended" | "Recommended" | "Development Needed" | "Not Ready";

export function readinessScore(i: ReadinessInput, r: PromotionRuleConfig): { score: number; label: ReadinessLabel; parts: Record<string, number> } {
  const w = r.weights;
  const experiencePct = Math.min(100, (i.monthsInGrade / 36) * 100); // three years in grade = full marks
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const parts = {
    performance: clamp(i.avgPerformancePct),
    competencies: clamp(i.competenciesPct),
    experience: roundMoney(experiencePct, 1),
    qualifications: clamp(i.qualificationsPct),
    leadership: clamp(i.leadershipPct),
    values: clamp(i.valuesPct),
  };
  const total = w.performance + w.competencies + w.experience + w.qualifications + w.leadership + w.values;
  const weighted = (parts.performance * w.performance + parts.competencies * w.competencies + parts.experience * w.experience + parts.qualifications * w.qualifications + parts.leadership * w.leadership + parts.values * w.values) / (total || 100);
  const score = roundMoney(weighted, 1);
  const label: ReadinessLabel = score >= r.cutoffs.stronglyRecommended ? "Strongly Recommended" : score >= r.cutoffs.recommended ? "Recommended" : score >= r.cutoffs.developmentNeeded ? "Development Needed" : "Not Ready";
  return { score, label, parts };
}

// The new salary is the promotional uplift, but never below the new band's minimum.
export function promotedSalary(current: number, upliftPct: number, newBandMin: number | null, decimals = 0): number {
  const uplifted = current * (1 + upliftPct / 100);
  return roundMoney(Math.max(uplifted, newBandMin ?? 0), decimals);
}

export function monthsInGradeFrom(sinceIso: string, asOfIso: string): number {
  return completedMonths(sinceIso, asOfIso);
}

export function promotionLetter(i: { name: string; fromTitle: string; toTitle: string; fromGrade: string | null; toGrade: string | null; newSalary: number; effective: string; orgName: string }): string {
  const kes = `KES ${Math.round(i.newSalary).toLocaleString("en-KE")}`;
  return [
    `Dear ${i.name},`,
    "",
    `We are pleased to confirm your promotion from ${i.fromTitle}${i.fromGrade ? ` (${i.fromGrade})` : ""} to ${i.toTitle}${i.toGrade ? ` (${i.toGrade})` : ""}, effective ${i.effective}.`,
    "",
    `Your new basic salary will be ${kes} per month from the same date. All other terms and conditions of your employment remain as set out in your contract of employment unless you are told otherwise in writing.`,
    "",
    "Congratulations, and thank you for your contribution.",
    "",
    `Human Resources, ${i.orgName}`,
  ].join("\n");
}
