import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 10 §5.10 GET /api/analytics/forecasts/:id
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: run } = await supabase
    .from("analytics_forecast_runs")
    .select("*")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: results } = await supabase
    .from("analytics_forecast_results")
    .select("period_date, dimension_key, dimension_value, predicted_value, lower_bound, upper_bound")
    .eq("forecast_run_id", id)
    .order("period_date", { ascending: true });

  return NextResponse.json({ run, results: results ?? [] });
}
