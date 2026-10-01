import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 11 §11.4 GET /api/workforce-risks — RLS already scopes rows (hr/admin
// full register, manager read-only for their reports' employee-entity
// risks), so this just passes the session client through.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("workforce_risks")
    .select("id, rule_code, title, category, status, severity, risk_score, entity_type, entity_id, owner_user_id, last_detected_at")
    .not("status", "in", "(closed,dismissed,duplicate)")
    .order("risk_score", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ risks: data });
}
