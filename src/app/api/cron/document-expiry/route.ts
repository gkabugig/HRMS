import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateDocumentExpiries } from "@/lib/documents/expiry";

// Area 08 §20 Expiry & Renewal Engine — scheduled sweep. Same CRON_SECRET +
// service-role pattern as /api/cron/approval-escalations: there's no "current
// org" to scope an RLS-backed query by, and the sweep is inherently
// cross-org, run once a day against every document_expiries row due.
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
  const result = await evaluateDocumentExpiries(supabase);
  return NextResponse.json(result);
}
