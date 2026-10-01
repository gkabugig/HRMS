import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 17 §8.8 GET/POST /api/compensation/bands.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const gradeId = request.nextUrl.searchParams.get("grade_id");
  let query = supabase.from("compensation_bands").select("id, grade_id, currency, min_amount, max_amount, effective_from, effective_to").order("effective_from", { ascending: false });
  if (gradeId) query = query.eq("grade_id", gradeId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bands: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) return NextResponse.json({ error: "Only admin/HR can create bands." }, { status: 403 });

  const body = await request.json();
  if (!body.grade_id || body.min_amount == null || body.max_amount == null) {
    return NextResponse.json({ error: "grade_id, min_amount and max_amount are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("compensation_bands")
    .insert({
      org_id: appUser.org_id,
      grade_id: body.grade_id,
      currency: body.currency ?? "KES",
      min_amount: body.min_amount,
      max_amount: body.max_amount,
      effective_from: body.effective_from ?? new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
