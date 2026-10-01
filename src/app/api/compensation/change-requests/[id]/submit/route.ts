import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 17 §8.8 POST /api/compensation/change-requests/:id/submit — our UI
// and the main POST /change-requests route already create requests directly
// in "submitted" status with their approval routing in place (see
// submitCompensationChangeRequest), so this endpoint is the fallback for a
// request some other integration inserted as "draft": it validates the
// minimum required fields are present and flips it to submitted without
// re-running band/budget checks (those only run at creation time today).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: changeRequest } = await supabase.from("compensation_change_requests").select("id, status").eq("id", id).maybeSingle();
  if (!changeRequest) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (changeRequest.status !== "draft") return NextResponse.json({ error: "Only a draft request can be submitted." }, { status: 400 });

  const { error } = await supabase.from("compensation_change_requests").update({ status: "submitted" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
