export type Scorecard = {
  skills: number;
  experience: number;
  communication: number;
  culture_fit: number;
  recommendation: "Strong yes" | "Yes" | "No" | "Strong no";
};

export const RECOMMENDATIONS: Scorecard["recommendation"][] = ["Strong yes", "Yes", "No", "Strong no"];

export function cardAverage(c: Pick<Scorecard, "skills" | "experience" | "communication" | "culture_fit">): number {
  return Math.round(((c.skills + c.experience + c.communication + c.culture_fit) / 4) * 10) / 10;
}

// Combines the panel's cards into one number plus a tally of recommendations.
export function summariseScorecards(cards: Scorecard[]): {
  count: number;
  average: number | null;
  recommendations: Record<Scorecard["recommendation"], number>;
} {
  const recommendations = { "Strong yes": 0, Yes: 0, No: 0, "Strong no": 0 };
  for (const c of cards) recommendations[c.recommendation]++;
  if (cards.length === 0) return { count: 0, average: null, recommendations };
  const total = cards.reduce((s, c) => s + cardAverage(c), 0);
  return { count: cards.length, average: Math.round((total / cards.length) * 10) / 10, recommendations };
}

export function validScore(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}
