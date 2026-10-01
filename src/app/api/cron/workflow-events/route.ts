import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startWorkflowFromEvent } from "@/lib/workflows/runtime/start-run";

// Workflow Automation Engine (Area 03) — durability safety net for the
// event/outbox mechanism (spec §9/§19.D). The happy path
// (publishAndProcessEvent, called from submitProfileChangeRequest) already
// processes a workflow_events row synchronously in the same request that
// inserts it; this sweep only matters for the row left 'pending' because
// the process died between that insert and the processing call returning.
// Same CRON_SECRET + service-role pattern as /api/cron/approval-escalations
// — no user session to scope an RLS query by, and the sweep is inherently
// cross-org.
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
  // Anything older than a minute — a very recent row might just be a
  // concurrent synchronous call still in flight, not actually stuck.
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { data: pending, error } = await supabase
    .from("workflow_events")
    .select("id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { eventId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of pending ?? []) {
    try {
      await startWorkflowFromEvent(supabase, id);
      results.push({ eventId: id, ok: true });
    } catch (e) {
      // One event failing shouldn't stop the sweep from processing the
      // rest of the batch — startWorkflowFromEvent has already marked this
      // row 'failed' with the error before rethrowing, so it won't be
      // picked up again on the next run.
      results.push({ eventId: id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    checked: pending?.length ?? 0,
    processed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
  });
}
