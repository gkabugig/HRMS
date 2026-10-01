import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetricTrend } from "@/lib/intelligence/metrics/compute-metrics";

// Area 10 §5.10 GET /api/analytics/trends?metric_key=&points=
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const metricKey = searchParams.get("metric_key");
  if (!metricKey) return NextResponse.json({ error: "metric_key is required." }, { status: 400 });
  const points = Number(searchParams.get("points") ?? "12");

  const trend = await getMetricTrend(supabase, metricKey, Number.isFinite(points) ? points : 12);
  return NextResponse.json({ metric_key: metricKey, trend });
}
