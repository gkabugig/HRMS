import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingNotificationEvents } from "@/lib/notifications/scheduler";

// Area 09 §18 — safety-net sweep for the notification_events outbox.
// Most events are also processed immediately (processEventImmediately,
// called right after emitNotificationEvent from the Server Action that
// wrote them) for in-app UX parity with the old synchronous system; this
// cron exists so an event is never silently stuck in 'pending' forever
// if that immediate call failed, the request died first, or a future
// caller only emits without processing inline. Same CRON_SECRET +
// service-role pattern as every other cron route in this app.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const admin = createAdminClient();
  const processed = await processPendingNotificationEvents(admin, 100);
  return NextResponse.json({ processed });
}
