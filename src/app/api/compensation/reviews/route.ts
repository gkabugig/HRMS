import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createReviewCycle } from "@/lib/compensation/review-actions";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_review_cycles")
    .select("id, name, period_start, period_end, status, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviewCycles: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const formData = new FormData();
  formData.set("name", body.name ?? "");
  formData.set("period_start", body.period_start ?? "");
  formData.set("period_end", body.period_end ?? "");
  try {
    await createReviewCycle(formData);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
