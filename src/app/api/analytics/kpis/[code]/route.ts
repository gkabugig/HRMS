import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics, getMetricTrend } from "@/lib/intelligence/metrics/compute-metrics";
import type { ComputedMetric } from "@/lib/intelligence/metrics/metric-types";

// Area 10 §5.10 GET /api/analytics/kpis/:code — single KPI definition,
// current value and trend history.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: definition } = await supabase
    .from("metric_definitions")
    .select("key, name, description, formula, population, exclusions, unit, category, grain, version, refresh_frequency")
    .eq("key", code)
    .eq("active", true)
    .maybeSingle();

  if (!definition) return NextResponse.json({ error: "Unknown KPI code." }, { status: 404 });

  const [metrics, trend] = await Promise.all([computeWorkforceMetrics(supabase, appUser.org_id), getMetricTrend(supabase, code, 24)]);

  const current = Object.values(metrics).find((m) => m && typeof m === "object" && "key" in m && (m as ComputedMetric).key === code) as
    | ComputedMetric
    | undefined;

  return NextResponse.json({ definition, currentValue: current?.value ?? null, populationCount: current?.populationCount ?? null, trend });
}
