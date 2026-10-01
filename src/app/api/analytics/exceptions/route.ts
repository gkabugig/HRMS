import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Area 10 §5.10 GET /api/analytics/exceptions. Area 10 does not own a full
// exceptions/risk register — that is Area 11's Workforce Risk Centre,
// which does not exist yet in this build sequence. Until then this
// endpoint surfaces the two exception-like signals Area 10 already
// computes: open high-severity data-quality findings, and approval
// requests that have aged past a simple fixed threshold. Area 11's rule
// engine will supersede this with proper severity scoring, evidence and
// a lifecycle once built.
const STALE_APPROVAL_DAYS = 7;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - STALE_APPROVAL_DAYS);

  const [{ data: dqEvents }, { data: staleApprovals }] = await Promise.all([
    supabase
      .from("analytics_data_quality_events")
      .select("id, issue_code, entity_type, entity_id, description, detected_at")
      .eq("org_id", appUser.org_id)
      .eq("severity", "high")
      .is("resolved_at", null),
    supabase
      .from("approval_requests")
      .select("id, request_type, status, created_at")
      .eq("org_id", appUser.org_id)
      .in("status", ["draft", "submitted", "pending_approval", "returned"])
      .lt("created_at", staleThreshold.toISOString()),
  ]);

  return NextResponse.json({
    dataQualityExceptions: dqEvents ?? [],
    staleApprovals: staleApprovals ?? [],
    note: "Area 10 exceptions view — superseded by Area 11's Workforce Risk Centre once built.",
  });
}
