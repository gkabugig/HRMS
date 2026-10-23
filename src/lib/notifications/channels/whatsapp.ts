import type { NotificationChannelAdapter } from "./types";

// WhatsApp Business Cloud API (Meta). Business-initiated messages must use
// an approved template, so the default is a template whose body has one
// parameter, e.g. a Utility template named "stafftrack_alert" with the body
// "SKMG-HR alert: {{1}}". Without WHATSAPP_TEMPLATE_NAME, plain text is sent,
// which Meta only delivers inside a 24-hour window after the recipient last
// messaged the business number.
//
// Env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
//      WHATSAPP_TEMPLATE_NAME (recommended), WHATSAPP_TEMPLATE_LANG (default "en").
const GRAPH = "https://graph.facebook.com/v21.0";

export function isWhatsAppConfigured(): boolean {
  return !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

// Template parameters may not contain new lines, tabs or more than four
// spaces in a row, and the body is capped at 1024 characters.
export function toTemplateParam(text: string): string {
  return text.replace(/[\r\n\t]+/g, " | ").replace(/ {4,}/g, "   ").slice(0, 1000);
}

export type WhatsAppSendResult = { accepted: boolean; providerMessageId?: string; retryable?: boolean; errorCode?: string; errorMessage?: string };

export async function sendWhatsApp(to: string, text: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { accepted: false, retryable: false, errorCode: "provider_not_configured", errorMessage: "WhatsApp is not configured." };
  if (!/^\d{10,15}$/.test(to)) return { accepted: false, retryable: false, errorCode: "invalid_destination" };

  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const body = template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: toTemplateParam(text) }] }],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } };

  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { accepted: false, retryable: res.status >= 500 || res.status === 429, errorCode: `http_${res.status}`, errorMessage: errText.slice(0, 500) };
    }
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { accepted: true, providerMessageId: json.messages?.[0]?.id };
  } catch (err) {
    return { accepted: false, retryable: true, errorCode: "network_error", errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

export const whatsappAdapter: NotificationChannelAdapter = {
  channel: "whatsapp",
  validateDestination: (d) => /^\d{10,15}$/.test(d),
  async send(input) {
    if (!isWhatsAppConfigured()) {
      return { accepted: false, retryable: false, errorCode: "provider_not_configured", errorMessage: "WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set." };
    }
    return sendWhatsApp(input.destination, `${input.title}: ${input.body}`);
  },
};
