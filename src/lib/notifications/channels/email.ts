import type { NotificationChannelAdapter } from "./types";

// Area 09 §14/§31 step 20 "Implement email adapter and verified provider
// webhook." No email-sending infrastructure existed anywhere in this
// codebase before Area 09 (confirmed: no SDK, no SMTP config, no
// .env.example). This adapter calls Resend's HTTP API directly via
// fetch — no new npm dependency needed, Resend's API is a single POST.
//
// Per spec §31 step 21 ("add SMS/push/WhatsApp only after provider
// configuration and privacy review") the same discipline applies here in
// reverse: if RESEND_API_KEY isn't set, this adapter reports
// not-configured rather than silently no-op'ing or throwing — the
// dispatcher then dead-letters those deliveries immediately (not an
// infinite retry loop) and the Admin Notification Centre's "Provider
// health status" panel shows email as unconfigured. In-app notifications
// are fully functional with zero environment configuration either way.
const RESEND_API_URL = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.NOTIFICATIONS_EMAIL_FROM;
}

export const emailAdapter: NotificationChannelAdapter = {
  channel: "email",
  validateDestination(destination: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination);
  },
  async send(input) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.NOTIFICATIONS_EMAIL_FROM;
    if (!apiKey || !from) {
      return { accepted: false, retryable: false, errorCode: "provider_not_configured", errorMessage: "RESEND_API_KEY/NOTIFICATIONS_EMAIL_FROM not set." };
    }
    if (!emailAdapter.validateDestination(input.destination)) {
      return { accepted: false, retryable: false, errorCode: "invalid_destination" };
    }

    const actionHtml = input.actionUrl
      ? `<p><a href="${input.actionUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:6px;text-decoration:none;">${input.actionLabel ?? "Open SKMG-HR"}</a></p>`
      : "";
    const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;"><h2 style="margin-bottom:4px;">${input.title}</h2><p>${input.body}</p>${actionHtml}</div>`;

    try {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [input.destination],
          subject: input.title,
          html,
        }),
      });
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        const body = await res.text().catch(() => "");
        return { accepted: false, retryable, errorCode: `http_${res.status}`, errorMessage: body.slice(0, 500) };
      }
      const json = (await res.json()) as { id?: string };
      return { accepted: true, providerMessageId: json.id };
    } catch (err) {
      return { accepted: false, retryable: true, errorCode: "network_error", errorMessage: err instanceof Error ? err.message : String(err) };
    }
  },
};
