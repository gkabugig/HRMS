import type { SupabaseClient } from "@supabase/supabase-js";

// Area 10 §5.7/§5.8 forecasting. Deliberately simple and disclosed as such:
// ordinary-least-squares linear trend over the available metric_snapshots
// history for the mapped metric_key, projected forward `horizonPeriods`
// days. This is decision support, not a predictive model — §5.8 predictive
// governance requires methodology/limitations to always be shown, which the
// UI reads straight from analytics_forecast_runs.method/limitations.
//
// Data-quality gate (§5.8 "data-quality gates before forecast execution",
// test 10-03 "forecast with poor data quality -> blocked/flagged"): a
// forecast is BLOCKED if fewer than 3 historical snapshot points exist (not
// enough to fit any trend), and DEGRADED (still produced, but flagged) if
// there are 3-6 points, or if there are open high-severity data-quality
// findings against the workforce population the metric covers.
const FORECAST_METRIC_KEY: Record<string, string> = {
  headcount: "headcount_active",
  workforce_cost: "payroll_cost_gross",
  turnover: "turnover_rate",
  absence: "attendance_lateness_rate",
  vacancy_demand: "vacancy_rate",
};

export type ForecastType = keyof typeof FORECAST_METRIC_KEY;

export async function generateForecast(
  supabase: SupabaseClient,
  orgId: string,
  forecastType: ForecastType,
  generatedBy: string,
  horizonPeriods = 6
): Promise<{ runId: string; blocked: boolean }> {
  const metricKey = FORECAST_METRIC_KEY[forecastType];

  const { data: snapshots } = await supabase
    .from("metric_snapshots")
    .select("snapshot_date, value")
    .eq("org_id", orgId)
    .eq("metric_key", metricKey)
    .eq("dimension_key", "all")
    .order("snapshot_date", { ascending: true });

  const points = (snapshots ?? []).map((s, i) => ({ x: i, y: Number(s.value), date: s.snapshot_date as string }));

  const { count: highSeverityOpen } = await supabase
    .from("analytics_data_quality_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("severity", "high")
    .is("resolved_at", null);

  let dataQualityStatus: "ok" | "degraded" | "blocked" = "ok";
  let dataQualityNote: string | null = null;
  if (points.length < 3) {
    dataQualityStatus = "blocked";
    dataQualityNote = `Only ${points.length} historical snapshot(s) available for ${metricKey}; at least 3 are required to fit a trend.`;
  } else if (points.length < 7 || (highSeverityOpen ?? 0) > 0) {
    dataQualityStatus = "degraded";
    dataQualityNote =
      points.length < 7
        ? `Only ${points.length} historical snapshots available; projection confidence is low.`
        : `${highSeverityOpen} open high-severity data-quality finding(s) may affect the underlying population.`;
  }

  const sourcePeriodStart = points[0]?.date ?? new Date().toISOString().slice(0, 10);
  const sourcePeriodEnd = points[points.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  const { data: run, error: runError } = await supabase
    .from("analytics_forecast_runs")
    .insert({
      org_id: orgId,
      forecast_type: forecastType,
      method: "linear_trend_ols",
      model_version: "v1-linear-trend",
      source_period_start: sourcePeriodStart,
      source_period_end: sourcePeriodEnd,
      horizon_periods: horizonPeriods,
      data_quality_status: dataQualityStatus,
      data_quality_note: dataQualityNote,
      status: dataQualityStatus === "blocked" ? "blocked" : "completed",
      generated_by: generatedBy,
    })
    .select("id")
    .single();

  if (runError || !run) throw new Error(runError?.message ?? "Failed to create forecast run.");

  if (dataQualityStatus === "blocked") {
    return { runId: run.id, blocked: true };
  }

  // Ordinary least squares on (x=index, y=value).
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Residual standard deviation, for a rough uncertainty band.
  const residuals = points.map((p) => p.y - (intercept + slope * p.x));
  const residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));

  const lastDate = new Date(sourcePeriodEnd);
  const results = [];
  for (let h = 1; h <= horizonPeriods; h++) {
    const x = n - 1 + h;
    const predicted = intercept + slope * x;
    const periodDate = new Date(lastDate);
    periodDate.setDate(periodDate.getDate() + h * 7); // weekly-spaced projection points
    results.push({
      forecast_run_id: run.id,
      period_date: periodDate.toISOString().slice(0, 10),
      dimension_key: "all",
      dimension_value: "all",
      predicted_value: Math.max(0, predicted),
      lower_bound: Math.max(0, predicted - 1.96 * residualStd),
      upper_bound: predicted + 1.96 * residualStd,
    });
  }

  const { error: resultsError } = await supabase.from("analytics_forecast_results").insert(results);
  if (resultsError) throw new Error(resultsError.message);

  return { runId: run.id, blocked: false };
}
