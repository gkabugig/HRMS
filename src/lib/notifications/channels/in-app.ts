import type { NotificationChannelAdapter } from "./types";

// Area 09 §14/§31 step 18 "Implement the in-app notification channel
// first ... should work without an external provider." In-app delivery
// IS the `notifications` row itself (created by the orchestrator before
// any channel adapter runs) — there is nothing further to "send": the
// Employee Portal/Manager Workspace read it directly via RLS. This
// adapter exists only so in-app satisfies the same interface as the
// others (e.g. for a future audit line, or if an in-app "delivery"
// record is ever wanted for symmetry) — the dispatcher never actually
// calls it today, since in-app has no notification_deliveries row.
export const inAppAdapter: NotificationChannelAdapter = {
  channel: "in_app",
  validateDestination: () => true,
  async send() {
    return { accepted: true };
  },
};
