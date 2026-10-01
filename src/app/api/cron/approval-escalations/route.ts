import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOverdueSteps, escalateStep, EscalationError } from "@/lib/approvals/escalate-step";

// Universal Approval Engine — scheduled SLA escalation (Area 02 spec §13).
// Runs with no user session (Vercel Cron has no browser, no cookies, no
// auth.uid()), so it's the one other legitimate use of the service-role
// client besides Auth Admin provisioning: there is no "current org" or
// "current user" to scope an RLS-backed query by, and the job is inherently
// cross-org (every organisation's overdue steps get escalated on the same
// schedule).
//
// Guarded by CRON_SECRET (set in Vercel's Environment Variables, and passed
// by vercel.json's cron config as the Authorization header) so this route
// can't be hit by anyone who finds the URL — Vercel Cron requests already
// carry it automatically for cron jobs defined in vercel.json, matching
// Vercel's documented pattern for securing cron routes.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const overdue = await findOverdueSteps(supabase);

  const results: { stepId: string; ok: boolean; error?: string }[] = [];
  for (const { stepId, orgId } of overdue) {
    try {
      await escalateStep(supabase, { stepId, orgId, reason: "SLA overdue (automatic)" });
      results.push({ stepId, ok: true });
    } catch (e) {
      // One step's escalation failing (already decided between the query
      // and this loop iteration, e.g.) shouldn't stop the rest of the
      // batch — log it in the response and keep going.
      results.push({ stepId, ok: false, error: e instanceof EscalationError ? e.message : (e as Error).message });
    }
  }

  return NextResponse.json({
    checked: overdue.length,
    escalated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
  });
}
