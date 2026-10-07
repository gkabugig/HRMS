import type { ReportFilters } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string | undefined): s is string {
  if (!s || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Turns the page's query string into safe filters. Anything invalid falls back
// to "this year so far"; a reversed range is put the right way round.
export function parseFilters(
  q: { from?: string; to?: string; department?: string; type?: string },
  today: string
): ReportFilters {
  let from = validDate(q.from) ? q.from : `${today.slice(0, 4)}-01-01`;
  let to = validDate(q.to) ? q.to : today;
  if (from > to) [from, to] = [to, from];
  const department = (q.department ?? "").trim().slice(0, 100) || null;
  const type = (q.type ?? "").trim().slice(0, 40) || null;
  return { from, to, department, employmentType: type };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const PRESETS = ["this-month", "last-month", "this-quarter", "this-year", "last-year", "last-90"] as const;
export type Preset = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<Preset, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  "last-year": "Last year",
  "last-90": "Last 90 days",
};

export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthEnd = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  switch (preset) {
    case "this-month":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "last-month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: monthEnd(py, pm) };
    }
    case "this-quarter": {
      const qs = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${pad(qs)}-01`, to: today };
    }
    case "this-year":
      return { from: `${y}-01-01`, to: today };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "last-90":
      return { from: addDays(today, -89), to: today };
  }
}

// Keeps heavy, day-by-day reports to a sensible window.
export function clampRange(f: ReportFilters, maxDays: number): { filters: ReportFilters; clamped: boolean } {
  const earliest = addDays(f.to, -(maxDays - 1));
  if (f.from >= earliest) return { filters: f, clamped: false };
  return { filters: { ...f, from: earliest }, clamped: true };
}

export function periodLabel(f: ReportFilters): string {
  const parts = [`${f.from} to ${f.to}`];
  if (f.department) parts.push(f.department);
  if (f.employmentType) parts.push(f.employmentType);
  return parts.join(" · ");
}
