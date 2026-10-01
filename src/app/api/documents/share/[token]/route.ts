import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemDocumentShare } from "@/lib/documents/shares";

// Public, unauthenticated redemption endpoint for a temporary document
// share link (Area 08 §9/§2). No session exists here — the recipient of a
// share link is not an HRMS user — so this is the other legitimate use of
// the service-role admin client besides Auth provisioning and the cron
// routes: redeemDocumentShare() independently re-validates
// expiry/revocation/max-views on every call and fails closed, which is the
// entire security boundary for a capability-based link like this one.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const supabase = createAdminClient();
  const result = await redeemDocumentShare(supabase, token);
  if (!result) {
    return NextResponse.json({ error: "This link has expired, been revoked, or is invalid." }, { status: 410 });
  }

  return NextResponse.redirect(result.url);
}
