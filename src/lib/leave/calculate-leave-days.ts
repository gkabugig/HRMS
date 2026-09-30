// Working-days calculator (spec §6: "Calculate working days using the
// organisation's work calendar"). This app's work calendar is Mon–Fri plus
// whatever public_holidays rows the org has on file — there's no separate
// per-branch work-week configuration yet, so Saturday/Sunday is the one
// universal rule and holidays subtract from it.
export function calculateLeaveDays(start: string, end: string, holidayDates: Set<string> = new Set()): number {
  const s = new Date(start);
  const e = new Date(end);
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidayDates.has(iso)) days++;
  }
  return days;
}
