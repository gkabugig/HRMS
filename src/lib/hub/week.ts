// Weeks run Monday to Sunday. Dates are plain "YYYY-MM-DD" strings in Kenyan time.
const DAY = 86_400_000;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime()) && toIso(parse(v)) === v;
}

export function weekStartOf(iso: string): string {
  const d = parse(iso);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return toIso(new Date(d.getTime() - dow * DAY));
}

export function addDays(iso: string, n: number): string {
  return toIso(new Date(parse(iso).getTime() + n * DAY));
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function inWeek(weekStart: string, iso: string): boolean {
  return iso >= weekStart && iso <= addDays(weekStart, 6);
}

export function sumHours(hours: (number | string)[]): number {
  return Math.round(hours.reduce<number>((s, h) => s + Number(h), 0) * 100) / 100;
}
