import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 11 §11.4 GET /api/workforce-risks/:id
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: risk, error } = await supabase.from("workforce_risks").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!risk) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: actions } = await supabase.from("workforce_risk_actions").select("id, title, status, due_at, completed_at").eq("risk_id", id);
  return NextResponse.json({ risk, actions: actions ?? [] });
}
