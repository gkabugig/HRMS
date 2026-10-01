import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Area 09 §8/§16 "Provider callbacks must be verified server-side using
// provider signatures/secrets" + "Webhook callbacks must be idempotent
// using provider message ID plus event type." Resend signs webhooks
// using the Svix format (svix-id/svix-timestamp/svix-signature headers,
// HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64-decoded
// portion of a `whsec_...` secret) — verified here with Node's built-in
// crypto, no new dependency needed for a single HMAC check.
function verifySvixSignature(secret: string, svixId: string, svixTimestamp: string, body: string, svixSignatureHeader: string): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const candidates = svixSignatureHeader.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  return candidates.some((c) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params;
  if (channel !== "email") {
    return NextResponse.json({ error: "Unsupported channel." }, { status: 404 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not configured." }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  const body = await request.text();

  if (!svixId || !svixTimestamp || !svixSignature || !verifySvixSignature(secret, svixId, svixTimestamp, body, svixSignature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  const providerMessageId = event.data?.email_id;
  if (!providerMessageId) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: delivery } = await admin
    .from("notification_deliveries")
    .select("id, status")
    .eq("provider_message_id", providerMessageId)
    .eq("channel", "email")
    .maybeSingle();
  if (!delivery) return NextResponse.json({ ok: true }); // unknown message id — nothing to update, still 200 so Resend doesn't retry forever.

  // Idempotent by construction: re-applying the same terminal status to an
  // already-terminal row is a no-op update, so a replayed webhook (same
  // provider message id, same event type) never double-effects anything.
  if (event.type === "email.delivered" && delivery.status !== "dead_letter") {
    await admin.from("notification_deliveries").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", delivery.id);
  } else if ((event.type === "email.bounced" || event.type === "email.complained") && delivery.status !== "dead_letter") {
    await admin
      .from("notification_deliveries")
      .update({ status: "dead_letter", failed_at: new Date().toISOString(), error_code: event.type })
      .eq("id", delivery.id);
    const { data: fullDelivery } = await admin.from("notification_deliveries").select("notification_id").eq("id", delivery.id).maybeSingle();
    const { data: notification } = fullDelivery
      ? await admin.from("notifications").select("org_id").eq("id", fullDelivery.notification_id).maybeSingle()
      : { data: null };
    if (notification) {
      await admin.from("notification_dead_letters").insert({
        org_id: notification.org_id,
        notification_id: fullDelivery!.notification_id,
        delivery_id: delivery.id,
        channel: "email",
        failure_reason: `Provider callback: ${event.type}`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
