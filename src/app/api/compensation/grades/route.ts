import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 17 §8.8 GET/POST /api/compensation/grades. Reference data: any
// signed-in org member can read (RLS: compensation_grades_org_read);
// writes are HR/admin-gated here AND by RLS.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("compensation_grades").select("id, code, name, description, order_rank, is_active").order("order_rank");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grades: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) return NextResponse.json({ error: "Only admin/HR can create grades." }, { status: 403 });

  const body = await request.json();
  if (!body.code || !body.name) return NextResponse.json({ error: "code and name are required." }, { status: 400 });

  const { data, error } = await supabase
    .from("compensation_grades")
    .insert({ org_id: appUser.org_id, code: body.code, name: body.name, description: body.description ?? null, order_rank: body.order_rank ?? 0 })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
