import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { generateForecast, type ForecastType } from "@/lib/intelligence/forecasting/generate-forecast";

const VALID_TYPES: ForecastType[] = ["headcount", "workforce_cost", "turnover", "absence", "vacancy_demand"];

// Area 10 §5.10 POST /api/analytics/forecasts
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const forecastType = body.forecast_type as ForecastType;
  if (!VALID_TYPES.includes(forecastType)) {
    return NextResponse.json({ error: "forecast_type must be one of: " + VALID_TYPES.join(", ") }, { status: 400 });
  }

  const result = await generateForecast(supabase, appUser.org_id, forecastType, user.id, body.horizon_periods ?? 6);
  await recordAuditEvent(supabase, {
    orgId: appUser.org_id,
    actorUserId: user.id,
    action: "forecast.generated",
    resourceType: "analytics_forecast_runs",
    resourceId: result.runId,
    eventCategory: "configuration",
    metadata: { forecast_type: forecastType, blocked: result.blocked },
  });
  return NextResponse.json(result);
}

// GET /api/analytics/forecasts — list recent runs (the :id variant lives in [id]/route.ts).
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
  const { data: runs } = await supabase
    .from("analytics_forecast_runs")
    .select("id, forecast_type, method, model_version, data_quality_status, status, generated_at")
    .eq("org_id", appUser.org_id)
    .order("generated_at", { ascending: false })
    .limit(50);
  return NextResponse.json({ runs: runs ?? [] });
}
