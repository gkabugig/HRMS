import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyCompensationChange } from "@/lib/compensation/apply-change";

// Area 17 §8.3 — the SCHEDULED->EFFECTIVE transition. A change request
// approved with a future effective_from sits as "scheduled" until that date
// arrives; this daily sweep applies it then, the same way
// decideCompensationChangeRequest applies an immediate one.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await admin.from("compensation_change_requests").select("id, org_id").eq("status", "scheduled").lte("effective_from", today);

  let applied = 0;
  const results = [];
  for (const row of due ?? []) {
    try {
      await applyCompensationChange(admin, row.id, null);
      applied++;
      results.push({ id: row.id, applied: true });
    } catch (err) {
      results.push({ id: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ due: due?.length ?? 0, applied, results });
}
