import Link from "next/link";
import { PRESETS, PRESET_LABEL, presetRange } from "@/lib/report-engine/filters";
import type { ReportDef } from "@/lib/report-engine/catalogue";
import type { ReportFilters } from "@/lib/report-engine/types";

const input = "border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 text-sm bg-[var(--surface)]";

// A plain GET form: choosing filters just reloads the page with them in the
// address, so a filtered report can be bookmarked or shared.
export default function FilterBar({
  def, filters, today, departments,
}: {
  def: ReportDef;
  filters: ReportFilters;
  today: string;
  departments: string[];
}) {
  const base = `/dashboard/reports/${def.key}`;
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (filters.department) p.set("department", filters.department);
    if (filters.employmentType) p.set("type", filters.employmentType);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `${base}?${p.toString()}`;
  };
  return (
    <div className="print:hidden space-y-2">
      {def.usesDates && (
        <div className="flex flex-wrap gap-2 text-xs">
          {PRESETS.map((p) => {
            const r = presetRange(p, today);
            const active = r.from === filters.from && r.to === filters.to;
            return (
              <Link
                key={p}
                href={keep({ from: r.from, to: r.to })}
                className={`px-2.5 py-1 rounded-full border ${active ? "bg-brand-600 text-white border-brand-600" : "border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:border-brand-300"}`}
              >
                {PRESET_LABEL[p]}
              </Link>
            );
          })}
        </div>
      )}
      <form action={base} method="get" className="flex flex-wrap items-end gap-3">
        {def.usesDates && (
          <>
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              From
              <input type="date" name="from" defaultValue={filters.from} className={`${input} block mt-0.5`} />
            </label>
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              To
              <input type="date" name="to" defaultValue={filters.to} className={`${input} block mt-0.5`} />
            </label>
          </>
        )}
        {def.usesPeople && (
          <>
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              Department
              <select name="department" defaultValue={filters.department ?? ""} className={`${input} block mt-0.5`}>
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutral-500 dark:text-neutral-400">
              Employment type
              <select name="type" defaultValue={filters.employmentType ?? ""} className={`${input} block mt-0.5`}>
                <option value="">All types</option>
                {["Permanent", "Contract", "Casual", "Intern"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {(def.usesDates || def.usesPeople) && (
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium">Apply</button>
        )}
      </form>
    </div>
  );
}
