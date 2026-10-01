import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 10 §5.10 GET /api/analytics/data-quality?resolved=true|false
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
  const resolvedParam = searchParams.get("resolved");

  let query = supabase
    .from("analytics_data_quality_events")
    .select("id, issue_code, issue_category, entity_type, entity_id, severity, description, detected_at, resolved_at")
    .eq("org_id", appUser.org_id)
    .order("detected_at", { ascending: false })
    .limit(500);

  if (resolvedParam === "true") query = query.not("resolved_at", "is", null);
  if (resolvedParam === "false" || resolvedParam === null) query = query.is("resolved_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}
