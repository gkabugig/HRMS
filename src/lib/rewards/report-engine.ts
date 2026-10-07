// The standard reward reports (spec §16). Pure: the same builder feeds the page and the CSV export.
import { ratingDistribution } from "./calibration-engine";

export type RepRow = {
  recId: string;
  cycleId: string | null;
  employeeId: string;
  name: string;
  department: string;
  managerName: string;
  grade: string;
  rating: string | null;
  type: string;
  status: string;
  calculated: number;
  recommended: number;
  pct: number | null;
  isException: boolean;
  justification: string | null;
  schemeName: string | null;
  poolId: string | null;
  excluded: boolean;
};
export type TxRow = { employeeId: string; name: string; department: string; type: string; amount: number; effective: string; status: string };
export type PoolRow = { id: string; name: string; type: string; budget: number };
export type CaseRow = { name: string; from: string; to: string; status: string; readiness: number | null; label: string | null };

export type ReportInput = { rows: RepRow[]; txs: TxRow[]; pools: PoolRow[]; cases: CaseRow[]; ratingOrder: string[] };
export type Section = { heading: string; columns: string[]; rows: (string | number)[][] };
export type Report = { key: string; title: string; answers: string; sections: Section[] };

export const REPORTS: { key: string; title: string; answers: string }[] = [
  { key: "pools", title: "Pool utilisation", answers: "How much of each pool is recommended, approved and paid" },
  { key: "distribution", title: "Performance distribution", answers: "How ratings spread across bands, by manager and department" },
  { key: "merit", title: "Merit summary", answers: "Average increase by band, grade and department" },
  { key: "bonus", title: "Bonus and incentive summary", answers: "Total and average payout by scheme" },
  { key: "pipeline", title: "Promotion pipeline", answers: "Who is in a case, and the outcomes" },
  { key: "exceptions", title: "Exceptions register", answers: "Every override, its reason and where it stands" },
  { key: "history", title: "Reward history", answers: "Every reward approved, and its payroll state" },
];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n);
const live = (s: string) => ["Open", "In Review", "Calibration", "Approved", "Finalised", "Paid"].includes(s);

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function buildReport(key: string, i: ReportInput): Report {
  const meta = REPORTS.find((r) => r.key === key) ?? REPORTS[0];
  const base = { key: meta.key, title: meta.title, answers: meta.answers };
  const merit = i.rows.filter((r) => r.type === "merit" && !r.excluded && live(r.status));

  switch (meta.key) {
    case "pools": {
      const rows = i.pools.map((p) => {
        const mine = i.rows.filter((r) => r.poolId === p.id);
        const recommended = sum(mine.filter((r) => ["Open", "In Review", "Calibration", "Approved"].includes(r.status)).map((r) => r.recommended));
        const approved = sum(mine.filter((r) => r.status === "Finalised").map((r) => r.recommended));
        const paid = sum(mine.filter((r) => r.status === "Paid").map((r) => r.recommended));
        const used = recommended + approved + paid;
        return [p.name, p.type, money(p.budget), money(recommended), money(approved), money(paid), money(p.budget - used), p.budget > 0 ? `${Math.round((used / p.budget) * 100)}%` : "—"];
      });
      return { ...base, sections: [{ heading: "Pools", columns: ["Pool", "Type", "Budget", "Recommended", "Approved", "Paid", "Remaining", "Used"], rows }] };
    }
    case "distribution": {
      const cols = ["Group", "People", ...i.ratingOrder];
      const mk = (key: (r: RepRow) => string) =>
        groupBy(merit, key).map(([g, list]) => {
          const d = ratingDistribution(list, i.ratingOrder);
          return [g, list.length, ...d.map((x) => `${x.count} (${Math.round(x.share)}%)`)];
        });
      return { ...base, sections: [{ heading: "By manager", columns: cols, rows: mk((r) => r.managerName) }, { heading: "By department", columns: cols, rows: mk((r) => r.department) }] };
    }
    case "merit": {
      const withPct = merit.filter((r) => r.pct !== null);
      const mk = (key: (r: RepRow) => string) => groupBy(withPct, key).map(([g, list]) => [g, list.length, r1(avg(list.map((r) => r.pct ?? 0))), money(avg(list.map((r) => r.recommended))), money(sum(list.map((r) => r.recommended)))]);
      const cols = (g: string) => [g, "People", "Avg increase %", "Avg annual cost", "Total annual cost"];
      return {
        ...base,
        sections: [
          { heading: "By rating", columns: cols("Rating"), rows: mk((r) => r.rating ?? "Unrated") },
          { heading: "By grade", columns: cols("Grade"), rows: mk((r) => r.grade) },
          { heading: "By department", columns: cols("Department"), rows: mk((r) => r.department) },
        ],
      };
    }
    case "bonus": {
      const pay = i.rows.filter((r) => ["bonus", "incentive", "spot", "retention", "referral", "long_service"].includes(r.type) && !r.excluded && live(r.status) && r.recommended > 0);
      const rows = groupBy(pay, (r) => r.schemeName ?? (r.type === "bonus" ? "Performance bonus" : r.type.replace("_", " "))).map(([g, list]) => [g, list.length, money(sum(list.map((r) => r.recommended))), money(avg(list.map((r) => r.recommended)))]);
      rows.push(["Total", pay.length, money(sum(pay.map((r) => r.recommended))), pay.length ? money(avg(pay.map((r) => r.recommended))) : 0]);
      return { ...base, sections: [{ heading: "By scheme", columns: ["Scheme", "Payouts", "Total", "Average"], rows }] };
    }
    case "pipeline": {
      const rows = i.cases.map((c) => [c.name, `${c.from} → ${c.to}`, c.status, c.readiness ?? "—", c.label ?? "—"]);
      const counts = groupBy(i.cases, (c) => c.status).map(([s, l]) => [s, l.length]);
      return { ...base, sections: [{ heading: "Outcomes", columns: ["Status", "Cases"], rows: counts }, { heading: "Cases", columns: ["Employee", "Move", "Status", "Readiness", "Label"], rows }] };
    }
    case "exceptions": {
      const ex = i.rows.filter((r) => r.isException);
      return { ...base, sections: [{ heading: "Exceptions", columns: ["Employee", "Type", "Calculated", "Recommended", "Status", "Reason"], rows: ex.map((r) => [r.name, r.type, money(r.calculated), money(r.recommended), r.status, r.justification ?? "—"]) }] };
    }
    default: {
      const rows = i.txs.map((t) => [t.name, t.department, t.type === "salary_change" ? "Salary change (monthly increase)" : "Earning", money(t.amount), t.effective, t.status]);
      const earnings = sum(i.txs.filter((t) => t.type === "earning").map((t) => t.amount));
      const raises = sum(i.txs.filter((t) => t.type === "salary_change").map((t) => t.amount));
      return {
        ...base,
        sections: [
          { heading: "Totals (from the transactions table)", columns: ["Earnings paid or pending", "Monthly salary increases", "Transactions"], rows: [[money(earnings), money(raises), i.txs.length]] },
          { heading: "Transactions", columns: ["Employee", "Department", "Kind", "Amount", "Effective", "Payroll"], rows },
        ],
      };
    }
  }
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s;
};
export function reportCsv(r: Report): string {
  return r.sections.map((s) => [esc(s.heading), s.columns.map(esc).join(","), ...s.rows.map((row) => row.map(esc).join(","))].join("\n")).join("\n\n");
}
