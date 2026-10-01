import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeWorkforceMetrics } from "@/lib/intelligence/metrics/compute-metrics";
import { runDataQualityScan } from "@/lib/intelligence/data-quality/run-data-quality-scan";

// Area 10 §5.4 daily snapshot sweep. computeWorkforceMetrics already writes
// metric_snapshots as a side effect of being viewed (Phase 3 "compute on
// view" pattern), but relying only on someone opening the dashboard means a
// quiet org (or a weekend) can silently miss a day of trend history, which
// starves the §5.7 forecaster of points. This cron (daily, low traffic
// hour) guarantees one snapshot per org per day regardless of who's
// looking, and also runs the data-quality scan (§5.9) so the Data Quality
// screen and the forecast gate stay current without a manual "Run scan"
// click. Same CRON_SECRET + service-role pattern as every other cron route.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id");

  let snapshotted = 0;
  let scanned = 0;
  for (const org of orgs ?? []) {
    try {
      await computeWorkforceMetrics(admin, org.id);
      snapshotted++;
    } catch {
      // Non-fatal per org — one org's transient failure shouldn't block the rest.
    }
    try {
      await runDataQualityScan(admin, org.id);
      scanned++;
    } catch {
      // Non-fatal per org.
    }
  }

  return NextResponse.json({ orgs: orgs?.length ?? 0, snapshotted, scanned });
}
