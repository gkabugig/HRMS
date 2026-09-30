// Pure helpers for the Reports module: CSV building and small date/attendance
// calculations shared between the report page and its CSV export routes.
// No framework or DB dependencies — easy to unit test, mirrors the pattern
// used in lib/payroll/calculate.ts.

export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export function csvResponse(filename: string, rows: Record<string, string | number | null | undefined>[]) {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function currentYearRange(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// Mirrors the definition in dashboard/attendance/page.tsx — kept in one place
// here so the report and its CSV export never disagree with each other.
const EXPECTED_START = "08:00";
const GRACE_MINUTES = 15;

export function isLateClockIn(clockIn: string | null): boolean {
  if (!clockIn) return false;
  const [eh, em] = EXPECTED_START.split(":").map(Number);
  const [ah, am] = clockIn.split(":").map(Number);
  return ah * 60 + am > eh * 60 + em + GRACE_MINUTES;
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((acc, item) => acc + value(item), 0);
}
