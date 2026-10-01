import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitCompensationChangeRequest } from "@/lib/compensation/change-request-actions";

// Area 17 §8.8 GET/POST /api/compensation/change-requests. RLS already
// scopes GET to hr/admin (full) or the requester's own manager-read rows.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("compensation_change_requests")
    .select("id, employee_id, status, effective_from, proposed_basic, is_outside_band, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changeRequests: data });
}

// POST creates a request in "draft+submitted" in one call, reusing the
// server action's validation (band check, exception requirement, budget
// check, approval routing) rather than duplicating it inline.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) formData.set(key, String(value));
  }
  try {
    await submitCompensationChangeRequest(formData);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
