// Calibration flags and the fairness report (spec §15). Pure functions.
// A flag is a prompt for a person to look, never a finding of wrongdoing.

export type CalibrationThresholds = {
  skewPoints: number; // a manager's top-rating share this many points above the organisation's
  minTeamForSkew: number;
  overridePct: number; // recommended differs from calculated by more than this %
  deptVariancePoints: number; // a department's average merit % this far from the organisation's
  minGroupSize: number; // fairness groups smaller than this are hidden
};

export const DEFAULT_THRESHOLDS: CalibrationThresholds = { skewPoints: 20, minTeamForSkew: 3, overridePct: 15, deptVariancePoints: 1.5, minGroupSize: 5 };

export type CalRow = {
  recId: string;
  employeeId: string;
  name: string;
  department: string;
  managerId: string | null;
  managerName: string;
  rewardType: string;
  rating: string | null;
  pct: number | null;
  meritMin: number | null;
  meritMax: number | null;
  calculated: number;
  recommended: number;
  bonusCapped: boolean;
  bonusOverCap: boolean;
  missingEvidence: boolean;
  excluded: boolean;
};

export type Flag = { kind: string; label: string; detail: string; recId?: string; employeeId?: string; group?: string };

export const TOP_RATING = (ratings: string[]) => ratings[0];

export function ratingDistribution(rows: Pick<CalRow, "rating">[], order: string[]): { rating: string; count: number; share: number }[] {
  const rated = rows.filter((r) => r.rating);
  const total = rated.length;
  return order.map((rating) => {
    const count = rated.filter((r) => r.rating === rating).length;
    return { rating, count, share: total ? (count / total) * 100 : 0 };
  });
}

// Rating rows are per employee; merit and bonus both carry it, so use merit rows only.
export function calibrationFlags(rows: CalRow[], ratingOrder: string[], t: CalibrationThresholds = DEFAULT_THRESHOLDS): Flag[] {
  const flags: Flag[] = [];
  const merit = rows.filter((r) => r.rewardType === "merit" && !r.excluded);
  const top = ratingOrder[0];
  const orgTop = merit.length ? (merit.filter((r) => r.rating === top).length / merit.length) * 100 : 0;

  // Rating skew by manager
  const byMgr = new Map<string, CalRow[]>();
  for (const r of merit) byMgr.set(r.managerName, [...(byMgr.get(r.managerName) ?? []), r]);
  for (const [mgr, list] of byMgr) {
    if (list.length < t.minTeamForSkew) continue;
    const share = (list.filter((r) => r.rating === top).length / list.length) * 100;
    if (share - orgTop > t.skewPoints) flags.push({ kind: "rating_skew", label: "Rating skew", group: mgr, detail: `${mgr}: ${Math.round(share)}% of ${list.length} are rated ${top}, against ${Math.round(orgTop)}% across the organisation.` });
  }

  // Department variance (average merit %)
  const withPct = merit.filter((r) => r.pct !== null);
  const orgAvg = withPct.length ? withPct.reduce((s, r) => s + (r.pct ?? 0), 0) / withPct.length : 0;
  const byDept = new Map<string, CalRow[]>();
  for (const r of withPct) byDept.set(r.department, [...(byDept.get(r.department) ?? []), r]);
  for (const [dept, list] of byDept) {
    if (list.length < t.minTeamForSkew) continue;
    const avg = list.reduce((s, r) => s + (r.pct ?? 0), 0) / list.length;
    if (Math.abs(avg - orgAvg) > t.deptVariancePoints) flags.push({ kind: "department_variance", label: "Department variance", group: dept, detail: `${dept}: average merit increase ${avg.toFixed(1)}% against ${orgAvg.toFixed(1)}% across the organisation.` });
  }

  for (const r of rows) {
    if (r.excluded) continue;
    const who = { recId: r.recId, employeeId: r.employeeId };
    if (r.rewardType === "merit" && r.pct !== null && r.meritMin !== null && r.meritMax !== null && (r.pct < r.meritMin || r.pct > r.meritMax))
      flags.push({ ...who, kind: "merit_out_of_range", label: "Merit out of range", detail: `${r.name}: ${r.pct}% is outside the ${r.meritMin}–${r.meritMax}% range for the cell.` });
    if (r.rewardType === "bonus" && r.bonusOverCap) flags.push({ ...who, kind: "bonus_over_cap", label: "Bonus over cap", detail: `${r.name}: recommended bonus is above the scheme cap.` });
    if (["merit", "bonus"].includes(r.rewardType) && r.calculated > 0 && (Math.abs(r.recommended - r.calculated) / r.calculated) * 100 > t.overridePct)
      flags.push({ ...who, kind: "override_gap", label: "Override gap", detail: `${r.name}: ${r.rewardType} differs from the calculated figure by ${Math.round((Math.abs(r.recommended - r.calculated) / r.calculated) * 100)}%.` });
    if (r.missingEvidence && r.recommended > 0) flags.push({ ...who, kind: "incomplete_evidence", label: "Incomplete evidence", detail: `${r.name}: recommended with missing review data.` });
  }
  return flags;
}

export type Person = { gender: string | null; department: string; grade: string; monthsService: number; pct: number | null; bonus: number; promoted: boolean };
export type FairnessGroup = { group: string; count: number; hidden: boolean; avgMeritPct: number | null; avgBonus: number | null; promoted: number | null };

export function serviceBand(months: number): string {
  if (months < 12) return "Under 1 year";
  if (months < 36) return "1–3 years";
  if (months < 60) return "3–5 years";
  return "5+ years";
}

// Groups under minGroupSize report only their existence, so no person can be read from a total.
export function fairnessBy(people: Person[], key: (p: Person) => string, minGroup = DEFAULT_THRESHOLDS.minGroupSize): FairnessGroup[] {
  const map = new Map<string, Person[]>();
  for (const p of people) map.set(key(p), [...(map.get(key(p)) ?? []), p]);
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, list]) => {
      if (list.length < minGroup) return { group, count: list.length, hidden: true, avgMeritPct: null, avgBonus: null, promoted: null };
      const pcts = list.filter((p) => p.pct !== null);
      return {
        group,
        count: list.length,
        hidden: false,
        avgMeritPct: pcts.length ? pcts.reduce((s, p) => s + (p.pct ?? 0), 0) / pcts.length : null,
        avgBonus: list.reduce((s, p) => s + p.bonus, 0) / list.length,
        promoted: list.filter((p) => p.promoted).length,
      };
    });
}
