// Default reward policy (spec §5, §7, §8). Every figure here is an
// illustrative default; HR sets the real values in the policy, which is
// stored as versioned JSON and snapshotted onto each recommendation.

export type PerformanceBand = { min: number; rating: string; factor: number };

export type MeritCell = { min: number; max: number };
export type RangePosition = "below" | "mid" | "above";

export type RewardPolicyConfig = {
  // Spec §5 score components, weights must total 100.
  scoreWeights: { kpi: number; goals: number; competencies: number; values: number; manager: number };
  // Highest `min` first. A score at or above `min` earns that band.
  bands: PerformanceBand[];
  // Position = salary ÷ band midpoint (spec §8).
  rangeCutoffs: { belowUnder: number; aboveOver: number };
  // rating name -> position -> % increase range.
  meritMatrix: Record<string, Record<RangePosition, MeritCell>>;
  eligibility: {
    minScorePct: number;
    minServiceMonths: number;
    requireActive: boolean;
    requireConfirmed: boolean; // excluded while still on probation
    blockOnOpenDiscipline: boolean;
    allowedEmploymentTypes: string[]; // empty = all
  };
  bonus: {
    defaultTargetPct: number; // % of annual base, used when the grade has none
    capPctOfTarget: number; // 150 = cap at 150% of target
    discretionPct: number; // manager may move a bonus up to this % either way
  };
  merit: { allowAboveBandMax: boolean };
  // Number of decimal places money is rounded to (0 = nearest shilling).
  roundingDecimals: number;
};

function cell(min: number, max: number): MeritCell {
  return { min, max };
}

export const DEFAULT_POLICY: RewardPolicyConfig = {
  scoreWeights: { kpi: 50, goals: 20, competencies: 15, values: 10, manager: 5 },
  bands: [
    { min: 90, rating: "Exceptional", factor: 1.5 },
    { min: 80, rating: "Exceeds Expectations", factor: 1.25 },
    { min: 70, rating: "Meets Expectations", factor: 1.0 },
    { min: 60, rating: "Partially Meets", factor: 0.5 },
    { min: 0, rating: "Does Not Meet", factor: 0 },
  ],
  rangeCutoffs: { belowUnder: 0.9, aboveOver: 1.1 },
  meritMatrix: {
    Exceptional: { below: cell(8, 10), mid: cell(6, 8), above: cell(4, 6) },
    "Exceeds Expectations": { below: cell(6, 8), mid: cell(4, 6), above: cell(3, 5) },
    "Meets Expectations": { below: cell(4, 6), mid: cell(3, 4), above: cell(2, 3) },
    "Partially Meets": { below: cell(0, 2), mid: cell(0, 2), above: cell(0, 1) },
    "Does Not Meet": { below: cell(0, 0), mid: cell(0, 0), above: cell(0, 0) },
  },
  eligibility: {
    minScorePct: 60,
    minServiceMonths: 6,
    requireActive: true,
    requireConfirmed: true,
    blockOnOpenDiscipline: true,
    allowedEmploymentTypes: [],
  },
  bonus: { defaultTargetPct: 10, capPctOfTarget: 150, discretionPct: 10 },
  merit: { allowAboveBandMax: false },
  roundingDecimals: 0,
};

export function validatePolicy(c: RewardPolicyConfig): string | null {
  const w = c.scoreWeights;
  const total = w.kpi + w.goals + w.competencies + w.values + w.manager;
  if (Math.round(total * 100) / 100 !== 100) return `Score weights must total 100% (they total ${total}%).`;
  if (c.bands.length === 0) return "Add at least one performance band.";
  for (let i = 1; i < c.bands.length; i++) if (c.bands[i].min >= c.bands[i - 1].min) return "Performance bands must run from the highest score down.";
  if (c.bands[c.bands.length - 1].min !== 0) return "The lowest band must start at 0%.";
  for (const b of c.bands) if (!c.meritMatrix[b.rating]) return `The merit matrix has no row for "${b.rating}".`;
  for (const [rating, row] of Object.entries(c.meritMatrix))
    for (const [pos, m] of Object.entries(row)) if (m.min > m.max) return `Merit matrix: ${rating} / ${pos} has a minimum above its maximum.`;
  if (c.rangeCutoffs.belowUnder >= c.rangeCutoffs.aboveOver) return "Range cut-offs: 'below' must be lower than 'above'.";
  return null;
}
