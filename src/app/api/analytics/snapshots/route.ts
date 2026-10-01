import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 10 §5.10 GET /api/analytics/snapshots?metric_key=&dimension_key=&dimension_value=&from=&to=
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

  let query = supabase
    .from("metric_snapshots")
    .select("metric_key, dimension_key, dimension_value, snapshot_date, value, population_count")
    .eq("org_id", appUser.org_id)
    .eq("metric_key", metricKey)
    .order("snapshot_date", { ascending: true });

  const dimensionKey = searchParams.get("dimension_key");
  if (dimensionKey) query = query.eq("dimension_key", dimensionKey);
  const dimensionValue = searchParams.get("dimension_value");
  if (dimensionValue) query = query.eq("dimension_value", dimensionValue);
  const from = searchParams.get("from");
  if (from) query = query.gte("snapshot_date", from);
  const to = searchParams.get("to");
  if (to) query = query.lte("snapshot_date", to);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data });
}
