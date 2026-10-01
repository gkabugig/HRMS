import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRiskScan } from "@/lib/intelligence/risk/run-risk-scan";

// Area 11 §6.6 daily rule-engine sweep, run after the analytics-snapshot
// cron (whose data-quality scan DATA-MGR-001/DATA-POS-001 read from) so the
// risk engine sees same-day findings rather than yesterday's.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id");

  let scanned = 0;
  const results = [];
  for (const org of orgs ?? []) {
    try {
      const result = await runRiskScan(admin, org.id, null);
      results.push({ orgId: org.id, ...result });
      scanned++;
    } catch (err) {
      results.push({ orgId: org.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ orgs: orgs?.length ?? 0, scanned, results });
}
