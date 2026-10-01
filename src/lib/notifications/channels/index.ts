import type { NotificationChannelAdapter } from "./types";
import { inAppAdapter } from "./in-app";
import { emailAdapter } from "./email";

// Area 09 §31 step 21: SMS/push/WhatsApp adapters only after provider
// configuration and privacy review — no Kenyan SMS gateway, push
// provider or WhatsApp Business API credential exists anywhere in this
// project. These stubs satisfy the interface (so notification_policy_rules
// can list them in allowed_channels without the dispatcher crashing) but
// always report not-configured, which dead-letters immediately rather
// than silently pretending to send.
function unconfiguredAdapter(channel: string): NotificationChannelAdapter {
  return {
    channel,
    validateDestination: () => false,
    async send() {
      return { accepted: false, retryable: false, errorCode: "provider_not_configured", errorMessage: `${channel} is not configured for this deployment.` };
    },
  };
}

export const channelAdapters: Record<string, NotificationChannelAdapter> = {
  in_app: inAppAdapter,
  email: emailAdapter,
  sms: unconfiguredAdapter("sms"),
  push: unconfiguredAdapter("push"),
  whatsapp: unconfiguredAdapter("whatsapp"),
};
