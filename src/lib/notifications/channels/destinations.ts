import type { SupabaseClient } from "@supabase/supabase-js";
import { isInternalUsernameEmail } from "@/lib/auth/username";
import { normaliseKenyanMsisdn } from "@/lib/branch-ops/rules";

// Area 09 §29 "Mask destinations in administrator screens unless full
// display is authorized." Only a masked form is ever stored in
// notification_deliveries.destination_masked — the real address is
// re-looked-up at send time (lookupDestination) and never persisted
// unmasked anywhere in this subsystem.
export function maskDestination(channel: string, destination: string): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    if (!domain) return "***";
    const visible = local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }
  if (channel === "sms" || channel === "whatsapp") {
    return destination.length > 4 ? `${"*".repeat(destination.length - 4)}${destination.slice(-4)}` : "****";
  }
  return "***";
}

// Looks up the real destination for a channel, from the authoritative
// identity source (auth.users for email — the work login, not a
// free-text address out of an event payload, per spec §11's "never
// infer a recipient from a client-provided value" applied to addresses
// too). SMS/push/WhatsApp have no configured source of a phone/device
// token anywhere in this schema yet, so they report "no destination"
// (the dispatcher then has nothing to send to, which surfaces correctly
// as "channel not configured" rather than silently fabricating one).
export async function lookupDestination(admin: SupabaseClient, channel: string, recipientUserId: string): Promise<string | null> {
  if (channel === "email") {
    const { data, error } = await admin.auth.admin.getUserById(recipientUserId);
    if (error || !data?.user?.email) return null;
    // Username-only accounts have a synthetic internal address that can't receive mail.
    if (isInternalUsernameEmail(data.user.email)) return null;
    return data.user.email;
  }
  if (channel === "whatsapp") {
    // The employee record's own phone number, normalised to 2547XXXXXXXX.
    const { data: au } = await admin.from("app_users").select("employee_id").eq("id", recipientUserId).maybeSingle();
    if (!au?.employee_id) return null;
    const { data: emp } = await admin.from("employees").select("phone_number").eq("id", au.employee_id).maybeSingle();
    return emp?.phone_number ? normaliseKenyanMsisdn(String(emp.phone_number)) : null;
  }
  return null;
}
