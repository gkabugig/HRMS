import Link from "next/link";
import { formatCell } from "@/lib/report-engine/export";
import { Doughnut, VerticalBars } from "@/components/charts/charts";
import type { ReportResult } from "@/lib/report-engine/types";

const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03]";
const TONE: Record<string, string> = { amber: "text-amber-600", red: "text-red-600", green: "text-green-600" };

export function StatGrid({ stats }: { stats: ReportResult["stats"] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className={`${card} p-4`} title={s.hint}>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</p>
          <p className={`text-xl font-semibold mt-0.5 ${s.tone ? TONE[s.tone] : "text-neutral-900 dark:text-neutral-50"}`}>{s.value}</p>
          {s.hint && <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function BarChart({ chart }: { chart: NonNullable<ReportResult["chart"]> }) {
  return (
    <div className={`${card} p-4`}>
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">{chart.title}</h2>
      {chart.items.length === 0 || chart.items.every((i) => i.value === 0) ? (
        <p className="text-sm text-neutral-400">Nothing to chart for these filters.</p>
      ) : chart.kind === "doughnut" ? (
        <Doughnut items={chart.items} format={chart.format} />
      ) : (
        <VerticalBars items={chart.items} format={chart.format} />
      )}
    </div>
  );
}

const MAX_ROWS = 500;

export function ReportTable({ report }: { report: ReportResult }) {
  const shown = report.rows.slice(0, MAX_ROWS);
  const firstTextKey = report.columns.find((c) => c.format !== "kes" && c.format !== "int")?.key ?? report.columns[0]?.key;
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              {report.columns.map((c) => (
                <th key={c.key} className={`px-4 py-2 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                {report.columns.map((c) => {
                  const text = formatCell(row.cells[c.key] ?? null, c.format);
                  return (
                    <td key={c.key} className={`px-4 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                      {row.href && c.key === firstTextKey ? (
                        <Link href={row.href} className="text-brand-600 hover:text-brand-700 hover:underline print:text-inherit print:no-underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={report.columns.length} className="px-4 py-8 text-center text-neutral-400 dark:text-neutral-500">
                  No records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {report.rows.length > MAX_ROWS && (
        <p className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
          Showing the first {MAX_ROWS} of {report.rows.length} rows. Download the CSV or Excel file for the full list.
        </p>
      )}
    </div>
  );
}
