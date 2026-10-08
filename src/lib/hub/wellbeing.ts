// Combined wellbeing figures. A week is only shown when enough people checked in
// that no one can be picked out from the average.
export const MIN_CHECKINS = 5;

export type WeekSummary = { weekStart: string; count: number; average: number | null };

export function summariseWeeks(rows: { week_start: string; mood: number }[], min = MIN_CHECKINS): WeekSummary[] {
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.week_start, [...(by.get(r.week_start) ?? []), r.mood]);
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, moods]) => ({
      weekStart,
      count: moods.length,
      average: moods.length >= min ? Math.round((moods.reduce((s, m) => s + m, 0) / moods.length) * 10) / 10 : null,
    }));
}
