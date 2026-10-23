// Pure rules for Branch Operations: what a person may do at the kiosk next,
// cash variance, report lateness, and the morning/evening exception lists.
// No database or framework imports, so all of it is unit tested.

export type KioskAction = "clock_in" | "start_lunch" | "end_lunch" | "clock_out";

export const KIOSK_ACTION_LABEL: Record<KioskAction, string> = {
  clock_in: "Clock in",
  start_lunch: "Start lunch",
  end_lunch: "Back from lunch",
  clock_out: "Clock out",
};

export function nextKioskActions(day: { clockIn: string | null; clockOut: string | null; onBreak: boolean }): KioskAction[] {
  if (!day.clockIn) return ["clock_in"];
  if (day.clockOut) return [];
  if (day.onBreak) return ["end_lunch"];
  return ["start_lunch", "clock_out"];
}

export function isKioskAction(v: unknown): v is KioskAction {
  return v === "clock_in" || v === "start_lunch" || v === "end_lunch" || v === "clock_out";
}

// Same formula as the generated column in branch_daily_reports, used to show
// the figure live while the manager fills the form in.
export function cashVariance(r: { openingFloat: number; cashSales: number; pettyCash: number; cashBanked: number; closingCash: number }): number {
  return round2(r.closingCash - (r.openingFloat + r.cashSales - r.pettyCash - r.cashBanked));
}

export function varianceFlagged(variance: number, threshold: number): boolean {
  return Math.abs(variance) > threshold;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// "1,250.50" / "1250.5" / "" -> number; anything else -> null.
export function parseAmount(input: string): number | null {
  const s = input.replace(/[,\s]/g, "").replace(/^KES/i, "");
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export function parseCount(input: string): number | null {
  const s = input.replace(/[,\s]/g, "");
  if (s === "") return 0;
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// A report is late when it is sent after the deadline on the report's own
// date, or on any later day. Dates are YYYY-MM-DD and times HH:MM, both in
// Kenya time.
export function isReportLate(reportDate: string, deadline: string, now: { date: string; time: string }): boolean {
  if (now.date > reportDate) return true;
  if (now.date < reportDate) return false;
  return toMinutes(now.time) > toMinutes(deadline);
}

export type RosterPerson = {
  employeeId: string;
  name: string;
  branchId: string;
  shiftStart: string; // HH:MM
  graceMinutes: number;
  onLeave: boolean;
  clockIn: string | null;
  clockOut: string | null;
};

export type BranchMorning = {
  branchId: string;
  branchName: string;
  expected: number;
  present: number;
  notOpen: boolean;
  late: { employeeId: string; name: string; clockIn: string; minutesLate: number }[];
  absent: { employeeId: string; name: string }[];
};

// Run after the grace period: who is late, who has not come in, and which
// branches have nobody clocked in at all. People on approved leave are not
// expected. Someone with no clock-in is only "absent" once their own start
// time plus grace has passed (`now` is HH:MM Kenya time).
export function morningExceptions(branches: { id: string; name: string }[], roster: RosterPerson[], now: string): BranchMorning[] {
  return branches.map((b) => {
    const people = roster.filter((p) => p.branchId === b.id && !p.onLeave);
    const late: BranchMorning["late"] = [];
    const absent: BranchMorning["absent"] = [];
    let present = 0;
    for (const p of people) {
      const due = toMinutes(p.shiftStart) + p.graceMinutes;
      if (p.clockIn) {
        present++;
        const m = toMinutes(p.clockIn) - toMinutes(p.shiftStart);
        if (toMinutes(p.clockIn) > due) late.push({ employeeId: p.employeeId, name: p.name, clockIn: p.clockIn.slice(0, 5), minutesLate: m });
      } else if (toMinutes(now) > due) {
        absent.push({ employeeId: p.employeeId, name: p.name });
      }
    }
    return { branchId: b.id, branchName: b.name, expected: people.length, present, notOpen: people.length > 0 && present === 0, late, absent };
  });
}

export type BranchEvening = {
  branchName: string;
  reportIn: boolean;
  reportLate: boolean;
  totalSales: number | null;
  variance: number | null;
  present: number;
  expected: number;
  lateCount: number;
};

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

// WhatsApp template parameters cannot contain line breaks, so the summary is
// one line per branch joined with " | ", split into chunks Meta will accept.
export function eveningSummaryMessages(date: string, rows: BranchEvening[], threshold: number, maxLen = 900): string[] {
  const missing = rows.filter((r) => !r.reportIn).map((r) => r.branchName);
  const totalSales = rows.reduce((s, r) => s + (r.totalSales ?? 0), 0);
  const head = `Daily summary ${date}: ${rows.length - missing.length}/${rows.length} reports in, sales ${kes(totalSales)}.${missing.length ? ` MISSING: ${missing.join(", ")}.` : ""}`;
  const parts = rows.map((r) => {
    const bits = [`${r.branchName}: staff ${r.present}/${r.expected}`];
    if (r.lateCount) bits.push(`${r.lateCount} late`);
    if (r.reportIn) {
      bits.push(`sales ${kes(r.totalSales ?? 0)}`);
      if (r.variance != null && varianceFlagged(r.variance, threshold)) bits.push(`CASH ${r.variance < 0 ? "SHORT" : "OVER"} ${kes(Math.abs(r.variance))}`);
      if (r.reportLate) bits.push("report late");
    } else bits.push("no report");
    return bits.join(", ");
  });
  const out: string[] = [];
  let cur = head;
  for (const p of parts) {
    if ((cur + " | " + p).length > maxLen) {
      out.push(cur);
      cur = p;
    } else cur = `${cur} | ${p}`;
  }
  out.push(cur);
  return out;
}

export function morningAlertMessage(b: BranchMorning): string | null {
  if (b.expected === 0) return null;
  if (b.notOpen) return `${b.branchName}: branch not open, nobody has clocked in (${b.expected} expected).`;
  const bits: string[] = [];
  if (b.late.length) bits.push(`late: ${b.late.map((l) => `${l.name} ${l.clockIn} (+${l.minutesLate} min)`).join(", ")}`);
  if (b.absent.length) bits.push(`not in: ${b.absent.map((a) => a.name).join(", ")}`);
  if (!bits.length) return null;
  return `${b.branchName} (${b.present}/${b.expected} in) - ${bits.join("; ")}.`;
}

// "0712 345 678", "+254712345678", "254712345678" -> "254712345678".
export function normaliseKenyanMsisdn(input: string): string | null {
  const d = input.replace(/[^\d]/g, "");
  if (/^0[17]\d{8}$/.test(d)) return `254${d.slice(1)}`;
  if (/^254[17]\d{8}$/.test(d)) return d;
  if (/^[17]\d{8}$/.test(d)) return `254${d}`;
  return null;
}
