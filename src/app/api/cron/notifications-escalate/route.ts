import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { escalateOverdueNotifications } from "@/lib/notifications/escalation";
import { sweepServiceRequestSlas } from "@/lib/service-requests/sla-sweep";
import { sweepOverdueWorkflowTasks } from "@/lib/workflows/sweep-overdue-tasks";

// Area 09 §19 Escalation Engine sweep. Cross-org by nature (no single
// org's session to scope by), so it loops every organisation and runs
// the policy-driven escalation check within each — mirrors how
// /api/cron/approval-escalations already handles the cross-org case for
// Area 02.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id");
  let totalEscalated = 0;
  for (const org of orgs ?? []) {
    const { escalated } = await escalateOverdueNotifications(admin, org.id as string);
    totalEscalated += escalated;
  }
  const sla = await sweepServiceRequestSlas(admin);
  const workflowTasks = await sweepOverdueWorkflowTasks(admin);
  return NextResponse.json({ escalated: totalEscalated, sla, workflowTasks });
}
