// Area 10 §5.4/§13 KPI Explorer — the full governed registry
// (metric_definitions, spec analytics_kpi_definitions) with each
// definition's formula, population, exclusions, grain and current value in
// one place, rather than scattered across the per-category dashboard tabs.
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics } from "@/lib/intelligence/metrics/compute-metrics";
import { formatMetricValue, type MetricUnit } from "@/lib/intelligence/metrics/metric-types";
import type { ComputedMetric } from "@/lib/intelligence/metrics/metric-types";

export default async function KpiExplorerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">
        The KPI Explorer is visible to HR and admin roles.
      </div>
    );
  }

  const [{ data: definitions }, metrics] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("key, name, description, formula, population, exclusions, unit, category, grain, version, refresh_frequency, active")
      .eq("active", true)
      .order("category"),
    computeWorkforceMetrics(supabase, appUser.org_id),
  ]);

  const metricsByKey = Object.values(metrics).reduce<Record<string, ComputedMetric>>((acc, m) => {
    if (m && typeof m === "object" && "key" in m) acc[(m as ComputedMetric).key] = m as ComputedMetric;
    return acc;
  }, {});

  const byCategory = new Map<string, typeof definitions>();
  for (const d of definitions ?? []) {
    byCategory.set(d.category, [...(byCategory.get(d.category) ?? []), d]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">KPI Explorer</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          The full governed KPI registry — name, formula, population, exclusions and grain, each with its current value (§5.4).
        </p>
      </div>

      {Array.from(byCategory.entries()).map(([category, defs]) => (
        <div key={category}>
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 uppercase tracking-wide mb-2">{category}</h2>
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] divide-y divide-neutral-50">
            {(defs ?? []).map((d) => {
              const current = metricsByKey[d.key];
              return (
                <div key={d.key} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{d.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{d.description}</p>
                    <dl className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1 space-y-0.5">
                      <div>
                        <dt className="inline font-medium">Formula: </dt>
                        <dd className="inline">{d.formula}</dd>
                      </div>
                      <div>
                        <dt className="inline font-medium">Population: </dt>
                        <dd className="inline">{d.population}</dd>
                      </div>
                      {d.exclusions && (
                        <div>
                          <dt className="inline font-medium">Exclusions: </dt>
                          <dd className="inline">{d.exclusions}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline font-medium">Grain: </dt>
                        <dd className="inline">{d.grain}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                      {current ? formatMetricValue(current.value, d.unit as MetricUnit) : "—"}
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500">v{d.version} · refreshed {d.refresh_frequency}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
