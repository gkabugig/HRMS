import { NextRequest, NextResponse } from "next/server";
import { getRewardContext, rewardAudit } from "@/lib/rewards/context";
import { loadReportInput } from "@/lib/rewards/report-data";
import { REPORTS, buildReport, reportCsv } from "@/lib/rewards/report-engine";

// CSV export of a standard report. HR only; every export is written to the audit trail.
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getRewardContext();
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!["admin", "hr"].includes(ctx.role)) return NextResponse.json({ error: "Only HR can export reward reports." }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const key = REPORTS.some((r) => r.key === p.get("report")) ? p.get("report")! : "pools";
  const filters = { cycle: p.get("cycle") || undefined, department: p.get("department") || undefined, grade: p.get("grade") || undefined, manager: p.get("manager") || undefined };
  const { input } = await loadReportInput(ctx.supabase, ctx.orgId, filters);
  const csv = reportCsv(buildReport(key, input));
  await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "report.exported", recordType: "reward_report", after: { report: key, filters } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reward-${key}.csv"` } });
}
