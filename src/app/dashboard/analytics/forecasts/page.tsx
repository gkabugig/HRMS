// Area 10 §5.7/§13 Forecasts screen. Every forecast always shows its
// methodology, source period, generation time, model version and
// limitations alongside the numbers (§5.7 requirement) — never just a
// number. Decision support only, never an automated employment decision.
import { createClient } from "@/lib/supabase/server";
import { runForecast } from "@/lib/intelligence/forecasting/actions";

const FORECAST_TYPES = [
  { key: "headcount", label: "Headcount" },
  { key: "workforce_cost", label: "Workforce Cost" },
  { key: "turnover", label: "Turnover" },
  { key: "absence", label: "Absence" },
  { key: "vacancy_demand", label: "Vacancy Demand" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-green-100 text-green-700",
  degraded: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
};

export default async function ForecastsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">
        Forecasts are visible to HR and admin roles.
      </div>
    );
  }

  const { data: runs } = await supabase
    .from("analytics_forecast_runs")
    .select("id, forecast_type, method, model_version, source_period_start, source_period_end, horizon_periods, data_quality_status, data_quality_note, status, limitations, generated_at")
    .order("generated_at", { ascending: false })
    .limit(20);

  const runIds = (runs ?? []).map((r) => r.id);
  const { data: results } = runIds.length
    ? await supabase
        .from("analytics_forecast_results")
        .select("forecast_run_id, period_date, predicted_value, lower_bound, upper_bound")
        .in("forecast_run_id", runIds)
        .order("period_date", { ascending: true })
    : { data: [] };

  const resultsByRun = new Map<string, typeof results>();
  for (const r of results ?? []) {
    resultsByRun.set(r.forecast_run_id, [...(resultsByRun.get(r.forecast_run_id) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Forecasts</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Trend-based projections — decision support only, never an automated employment decision (§5.8). Each run shows its method,
          source period and limitations.
        </p>
      </div>

      <form action={runForecast} className="flex flex-wrap items-end gap-2 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Forecast type</label>
          <select name="forecast_type" className="border border-neutral-200 rounded px-2 py-1.5 text-sm" required>
            {FORECAST_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
          Generate forecast
        </button>
      </form>

      <div className="space-y-4">
        {(runs ?? []).map((run) => {
          const runResults = resultsByRun.get(run.id) ?? [];
          return (
            <div key={run.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-neutral-900 capitalize">{run.forecast_type.replace(/_/g, " ")}</h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[run.data_quality_status]}`}>
                  {run.data_quality_status}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {run.method} · {run.model_version} · source {run.source_period_start} → {run.source_period_end} · generated{" "}
                {new Date(run.generated_at).toLocaleString("en-KE")}
              </p>
              {run.data_quality_note && <p className="text-xs text-amber-700 mt-1">{run.data_quality_note}</p>}
              <p className="text-xs text-neutral-400 mt-1 italic">{run.limitations}</p>
              {runResults.length > 0 ? (
                <table className="w-full text-xs mt-3">
                  <thead className="text-neutral-500 text-left">
                    <tr>
                      <th className="py-1 pr-4">Period</th>
                      <th className="py-1 pr-4">Predicted</th>
                      <th className="py-1 pr-4">Lower bound</th>
                      <th className="py-1 pr-4">Upper bound</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runResults.map((r, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="py-1 pr-4">{r.period_date}</td>
                        <td className="py-1 pr-4 font-medium text-neutral-800">{Number(r.predicted_value).toFixed(1)}</td>
                        <td className="py-1 pr-4 text-neutral-400">{r.lower_bound !== null ? Number(r.lower_bound).toFixed(1) : "—"}</td>
                        <td className="py-1 pr-4 text-neutral-400">{r.upper_bound !== null ? Number(r.upper_bound).toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-neutral-400 mt-2">Blocked — no projection produced.</p>
              )}
            </div>
          );
        })}
        {(runs ?? []).length === 0 && <p className="text-sm text-neutral-400">No forecasts generated yet.</p>}
      </div>
    </div>
  );
}
