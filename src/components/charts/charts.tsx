// Small, dependency-free charts drawn as plain HTML/SVG so they print well and
// follow light/dark mode. Every value is also written out in text (labels or a
// legend), so nothing depends on colour alone.
import { formatCell } from "@/lib/report-engine/export";

export type ChartItem = { label: string; value: number; color?: string };
type Fmt = "kes" | "int" | "pct" | "decimal" | "text" | undefined;

const SLOT = (i: number) => `var(--series-${(i % 8) + 1})`;

export function VerticalBars({ items, format }: { items: ChartItem[]; format?: Fmt }) {
  const shown = items.slice(0, 12);
  const max = Math.max(1, ...shown.map((i) => i.value));
  const HEIGHT = 180;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-3 pt-5 min-w-fit" role="img" aria-label="Bar chart">
        {shown.map((i) => {
          const h = Math.max(i.value > 0 ? 4 : 0, Math.round((i.value / max) * HEIGHT));
          return (
            <div key={i.label} className="flex flex-col items-center w-16 shrink-0" title={`${i.label}: ${formatCell(i.value, format ?? "int")}`}>
              <span className="text-[11px] text-neutral-600 dark:text-neutral-300 mb-1 whitespace-nowrap">{formatCell(i.value, format ?? "int")}</span>
              <div className="w-full flex items-end justify-center border-b border-neutral-200 dark:border-neutral-700" style={{ height: HEIGHT }}>
                <div
                  className="w-8 rounded-t-[4px] print:border print:border-neutral-400"
                  style={{ height: h, background: i.color ?? "var(--series-1)" }}
                />
              </div>
              <span className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-1.5 text-center leading-tight line-clamp-2 break-words w-full">{i.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Doughnut({ items, format }: { items: ChartItem[]; format?: Fmt }) {
  const positive = items.filter((i) => i.value > 0);
  // More than 8 slices become unreadable: fold the smallest into "Other".
  let parts = positive;
  if (positive.length > 8) {
    const sorted = [...positive].sort((a, b) => b.value - a.value);
    const rest = sorted.slice(7);
    parts = [...sorted.slice(0, 7), { label: "Other", value: rest.reduce((a, x) => a + x.value, 0), color: "var(--series-other)" }];
  }
  const total = parts.reduce((a, x) => a + x.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  const GAP = parts.length > 1 ? 1.2 : 0; // small surface-coloured gap between slices
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 100 100" className="w-40 h-40 shrink-0" role="img" aria-label="Doughnut chart">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="16" className="text-neutral-100 dark:text-neutral-800" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * C;
            const dash = Math.max(0, len - GAP);
            const el = (
              <circle
                key={p.label}
                cx="50" cy="50" r={R} fill="none" strokeWidth="16"
                stroke={p.color ?? SLOT(i)}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              >
                <title>{`${p.label}: ${formatCell(p.value, format ?? "int")} (${Math.round((p.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="50" y="48" textAnchor="middle" className="fill-neutral-900 dark:fill-neutral-50" style={{ fontSize: 11, fontWeight: 600 }}>
          {formatCell(total, format ?? "int").replace("KES ", "")}
        </text>
        <text x="50" y="59" textAnchor="middle" className="fill-neutral-500" style={{ fontSize: 5.5 }}>
          {format === "kes" ? "KES total" : "total"}
        </text>
      </svg>
      <ul className="flex-1 min-w-48 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0 print:border print:border-neutral-400" style={{ background: p.color ?? SLOT(i) }} />
            <span className="flex-1 truncate">{p.label}</span>
            <span className="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
              {formatCell(p.value, format ?? "int")} · {total ? Math.round((p.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
        {parts.length === 0 && <li className="text-neutral-400">Nothing to chart for these filters.</li>}
      </ul>
    </div>
  );
}
