import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeWorkforceMetrics } from "@/lib/intelligence/metrics/compute-metrics";
import type { ComputedMetric } from "@/lib/intelligence/metrics/metric-types";

// Area 10 §5.10 GET /api/analytics/kpis — the governed KPI registry with
// current values. Same admin/hr gate as the KPI Explorer screen and the
// underlying metric_definitions RLS policy (defense in depth).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [{ data: definitions }, metrics] = await Promise.all([
    supabase
      .from("metric_definitions")
      .select("key, name, description, formula, population, exclusions, unit, category, grain, version, refresh_frequency")
      .eq("active", true),
    computeWorkforceMetrics(supabase, appUser.org_id),
  ]);

  const metricsByKey = Object.values(metrics).reduce<Record<string, ComputedMetric>>((acc, m) => {
    if (m && typeof m === "object" && "key" in m) acc[(m as ComputedMetric).key] = m as ComputedMetric;
    return acc;
  }, {});

  const kpis = (definitions ?? []).map((d) => ({
    ...d,
    currentValue: metricsByKey[d.key]?.value ?? null,
    populationCount: metricsByKey[d.key]?.populationCount ?? null,
  }));

  return NextResponse.json({ kpis, computedAt: metrics.computedAt });
}
