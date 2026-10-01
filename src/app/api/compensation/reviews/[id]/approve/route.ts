import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveReviewItem } from "@/lib/compensation/review-actions";

// Area 17 §8.8 POST /api/compensation/reviews/:id/approve — approves the
// whole review cycle: every calibrated item gets its compensation change
// request created/applied (approveReviewItem), then the cycle itself is
// marked approved.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) return NextResponse.json({ error: "Only admin/HR can approve a review cycle." }, { status: 403 });

  const { data: cycle } = await supabase.from("compensation_review_cycles").select("id").eq("id", id).eq("org_id", appUser.org_id).maybeSingle();
  if (!cycle) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: items } = await supabase.from("compensation_review_items").select("id").eq("review_cycle_id", id).eq("status", "calibrated");
  const results = [];
  for (const item of items ?? []) {
    try {
      await approveReviewItem(item.id);
      results.push({ id: item.id, approved: true });
    } catch (err) {
      results.push({ id: item.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await supabase.from("compensation_review_cycles").update({ status: "approved" }).eq("id", id);

  return NextResponse.json({ approvedCount: results.filter((r) => r.approved).length, results });
}
