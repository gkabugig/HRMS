// Small, dependency-free charts drawn as plain HTML/SVG so they print well and
// follow light/dark mode. Every value is also written out in text (labels or a
// legend), so nothing depends on colour alone.
import Link from "next/link";
import { formatCell } from "@/lib/report-engine/export";

export type ChartItem = { label: string; value: number; color?: string; href?: string };
type Palette = "standard" | "vivid";
type Fmt = "kes" | "int" | "pct" | "decimal" | "text" | undefined;

const SLOT = (i: number, p: Palette = "standard") => `var(--${p === "vivid" ? "vivid" : "series"}-${(i % 8) + 1})`;

export function VerticalBars({
  items,
  format,
  palette = "standard",
  multicolor = false,
  compact = false,
  height = 180,
  valueLabel,
}: {
  items: ChartItem[];
  format?: Fmt;
  palette?: Palette;
  multicolor?: boolean; // one colour per bar instead of a single series colour
  compact?: boolean; // bars share the full width instead of fixed columns
  height?: number;
  valueLabel?: (n: number) => string;
}) {
  const shown = items.slice(0, 12);
  const max = Math.max(1, ...shown.map((i) => i.value));
  const fmt = (n: number) => (valueLabel ? valueLabel(n) : formatCell(n, format ?? "int"));
  return (
    <div className="overflow-x-auto">
      <div className={`flex items-end pt-5 ${compact ? "gap-1.5 w-full" : "gap-3 min-w-fit"}`} role="img" aria-label="Bar chart">
        {shown.map((i, idx) => {
          const h = Math.max(i.value > 0 ? 4 : 0, Math.round((i.value / max) * height));
          const base = i.color ?? (multicolor ? SLOT(idx, palette) : SLOT(0, palette));
          const column = (
            <div
              className={`group flex flex-col items-center ${compact ? "flex-1 min-w-0" : "w-16 shrink-0"}`}
              title={`${i.label}: ${fmt(i.value)}`}
            >
              <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 mb-1 whitespace-nowrap">{fmt(i.value)}</span>
              <div className="w-full flex items-end justify-center border-b border-neutral-200 dark:border-neutral-700" style={{ height }}>
                <div
                  className={`${compact ? "w-full max-w-9" : "w-8"} rounded-t-md transition-all duration-200 group-hover:brightness-110 group-hover:-translate-y-0.5 print:border print:border-neutral-400`}
                  style={{ height: h, background: `linear-gradient(to top, ${base}, color-mix(in srgb, ${base} 65%, white))`, boxShadow: `0 4px 12px -4px ${base}` }}
                />
              </div>
              <span className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-1.5 text-center leading-tight line-clamp-2 break-words w-full">{i.label}</span>
            </div>
          );
          return i.href ? (
            <Link key={i.label} href={i.href} className={`${compact ? "flex-1 min-w-0" : "shrink-0"} rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40`}>
              {column}
            </Link>
          ) : (
            <div key={i.label} className={compact ? "flex-1 min-w-0" : "shrink-0"}>{column}</div>
          );
        })}
      </div>
    </div>
  );
}

export function Doughnut({ items, format, palette = "standard", centreLabel }: { items: ChartItem[]; format?: Fmt; palette?: Palette; centreLabel?: string }) {
  const positive = items.filter((i) => i.value > 0);
  // More than 8 slices become unreadable: fold the smallest into "Other".
  let parts = positive;
  if (positive.length > 8) {
    const sorted = [...positive].sort((a, b) => b.value - a.value);
    const rest = sorted.slice(7);
    parts = [...sorted.slice(0, 7), { label: "Other", value: rest.reduce((a, x) => a + x.value, 0), color: palette === "vivid" ? "var(--vivid-other)" : "var(--series-other)" }];
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
                className="transition-opacity hover:opacity-80"
                cx="50" cy="50" r={R} fill="none" strokeWidth="16"
                stroke={p.color ?? SLOT(i, palette)}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              >
                <title>{`${p.label}: ${formatCell(p.value, format ?? "int")} (${Math.round((p.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return p.href ? (
              <Link key={p.label} href={p.href} className="cursor-pointer">
                {el}
              </Link>
            ) : (
              el
            );
          })}
        <text x="50" y="48" textAnchor="middle" className="fill-neutral-900 dark:fill-neutral-50" style={{ fontSize: 11, fontWeight: 600 }}>
          {formatCell(total, format ?? "int").replace("KES ", "")}
        </text>
        <text x="50" y="59" textAnchor="middle" className="fill-neutral-500" style={{ fontSize: 5.5 }}>
          {centreLabel ?? (format === "kes" ? "KES total" : "total")}
        </text>
      </svg>
      <ul className="flex-1 min-w-48 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label}>
            {(() => {
              const row = (
                <>
                  <span className="w-3 h-3 rounded-full shrink-0 print:border print:border-neutral-400" style={{ background: p.color ?? SLOT(i, palette) }} />
                  <span className="flex-1 truncate">{p.label}</span>
                  <span className="text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-100">{formatCell(p.value, format ?? "int")}</span> · {total ? Math.round((p.value / total) * 100) : 0}%
                  </span>
                </>
              );
              return p.href ? (
                <Link href={p.href} className="flex items-center gap-2 -mx-1.5 px-1.5 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-2">{row}</div>
              );
            })()}
          </li>
        ))}
        {parts.length === 0 && <li className="text-neutral-400">Nothing to chart for these filters.</li>}
      </ul>
    </div>
  );
}
