import type { ComputedMetric } from "@/lib/intelligence/metrics/metric-types";
import { formatMetricValue } from "@/lib/intelligence/metrics/metric-types";

// A KPI card that also carries its own definition (spec §4.3: "Show data
// freshness and definition on metric hover/detail"). The <details> element
// keeps this a plain server component — no client JS needed for what is,
// in effect, a tooltip.
export default function MetricCard({ metric, computedAt }: { metric: ComputedMetric; computedAt: string }) {
  const def = metric.definition;
  const unit = def?.unit ?? "count";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium text-neutral-500">{def?.name ?? metric.key}</div>
        {def && (
          <details className="relative">
            <summary className="list-none cursor-pointer text-neutral-400 hover:text-neutral-600 text-xs select-none">ⓘ</summary>
            <div className="absolute right-0 z-10 mt-1 w-72 bg-neutral-900 text-neutral-100 text-xs rounded-lg p-3 shadow-lg space-y-1.5">
              <p>{def.description}</p>
              <p>
                <span className="text-neutral-400">Formula: </span>
                {def.formula}
              </p>
              <p>
                <span className="text-neutral-400">Population: </span>
                {def.population}
              </p>
              {def.exclusions && (
                <p>
                  <span className="text-neutral-400">Exclusions: </span>
                  {def.exclusions}
                </p>
              )}
              <p className="text-neutral-400">
                As of {new Date(computedAt).toLocaleString()} · {def.refreshFrequency}
              </p>
            </div>
          </details>
        )}
      </div>
      <div className="text-[26px] leading-tight font-semibold text-neutral-900 tracking-tight mt-2">
        {formatMetricValue(metric.value, unit as never)}
      </div>
      {metric.populationCount !== null && (
        <div className="mt-1 text-xs text-neutral-400">n = {metric.populationCount.toLocaleString()}</div>
      )}
    </div>
  );
}
