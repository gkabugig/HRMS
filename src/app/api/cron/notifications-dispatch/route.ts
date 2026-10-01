import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchQueuedDeliveries } from "@/lib/notifications/dispatch";

// Area 09 §15 — sends queued external-channel deliveries (currently
// email; sms/push/whatsapp report not-configured) and applies the
// retry/dead-letter state machine. Runs frequently (every 5 minutes —
// see vercel.json) since quiet-hours-deferred and retrying deliveries
// both depend on this sweep noticing their next_retry_at has arrived.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const result = await dispatchQueuedDeliveries(admin, 200);
  return NextResponse.json(result);
}
