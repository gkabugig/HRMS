import { getNotifications, getNotificationPreferences, updateNotificationPreferences } from "@/lib/notifications/actions";
import NotificationList from "./notification-list";

const CATEGORY_LABELS: Record<string, string> = {
  leave: "Leave",
  attendance: "Attendance",
  payroll: "Payroll",
  compliance: "Compliance",
  training: "Training",
  performance: "Performance",
  recruitment: "Recruitment",
  offboarding: "Offboarding",
  documents: "Documents",
  system: "System",
  approval: "Approvals & workflow tasks",
  service_request: "HR service cases",
  self_service: "Self-service updates",
};

export default async function NotificationsPage() {
  const [{ notifications, unreadCount }, preferences] = await Promise.all([
    getNotifications(),
    getNotificationPreferences(),
  ]);

  // Quiet hours/timezone are stored per-row today but set once per user —
  // pull the first row's values as the shared starting point for the form.
  const shared = preferences[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Notifications</h1>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && <span className="text-xs text-neutral-500">{unreadCount} unread</span>}
          <a href="#notification-preferences" className="text-xs text-brand-600 hover:underline">
            Preferences
          </a>
        </div>
      </div>
      <NotificationList initial={notifications} />

      <details id="notification-preferences" className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] scroll-mt-4">
        <summary className="px-4 py-3 text-sm font-semibold text-neutral-900 cursor-pointer">Notification preferences</summary>
        <form action={updateNotificationPreferences} className="px-4 pb-4 pt-1 text-sm space-y-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-center">In-app</th>
                  <th className="px-3 py-2 font-medium text-center">Email</th>
                  <th className="px-3 py-2 font-medium text-center">Digest</th>
                </tr>
              </thead>
              <tbody>
                {preferences.map((p) => (
                  <tr key={p.notification_type} className="border-t border-neutral-100">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {CATEGORY_LABELS[p.notification_type] ?? p.notification_type}
                        {p.hasMandatoryEvents && (
                          <span
                            className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1 cursor-help"
                            title="This category includes mandatory notifications (e.g. compliance deadlines, SLA breaches). Those will still be delivered in-app — and by email where configured — even if you turn this off here."
                          >
                            Some mandatory
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        name={`${p.notification_type}_in_app`}
                        defaultChecked={p.in_app}
                        aria-label={`In-app notifications for ${CATEGORY_LABELS[p.notification_type] ?? p.notification_type}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        name={`${p.notification_type}_email`}
                        defaultChecked={p.email}
                        aria-label={`Email notifications for ${CATEGORY_LABELS[p.notification_type] ?? p.notification_type}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select
                        name={`${p.notification_type}_digest`}
                        defaultValue={p.digest_mode}
                        aria-label={`Digest frequency for ${CATEGORY_LABELS[p.notification_type] ?? p.notification_type}`}
                        className="border border-neutral-200 rounded px-1.5 py-1 text-xs"
                      >
                        <option value="instant">Instant</option>
                        <option value="daily">Daily digest</option>
                        <option value="weekly">Weekly digest</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <p className="text-sm font-medium text-neutral-900 mb-2">Quiet hours</p>
            <p className="text-xs text-neutral-400 mb-2">
              During quiet hours, non-critical email/SMS/push notifications are held until the window ends. In-app notifications and
              critical or mandatory alerts are never delayed.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                Start
                <input
                  type="time"
                  name="quiet_hours_start"
                  defaultValue={shared?.quiet_hours_start?.slice(0, 5) ?? ""}
                  className="border border-neutral-200 rounded px-2 py-1"
                  aria-label="Quiet hours start time"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                End
                <input
                  type="time"
                  name="quiet_hours_end"
                  defaultValue={shared?.quiet_hours_end?.slice(0, 5) ?? ""}
                  className="border border-neutral-200 rounded px-2 py-1"
                  aria-label="Quiet hours end time"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                Timezone
                <select
                  name="timezone"
                  defaultValue={shared?.timezone ?? "Africa/Nairobi"}
                  className="border border-neutral-200 rounded px-2 py-1"
                  aria-label="Timezone for quiet hours"
                >
                  <option value="Africa/Nairobi">Africa/Nairobi</option>
                  <option value="UTC">UTC</option>
                </select>
              </label>
            </div>
          </div>

          <p className="text-xs text-neutral-400">
            Critical notifications (payroll blocks, compliance expiry, SLA breaches) always show in-app regardless of these settings.
          </p>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
            Save preferences
          </button>
        </form>
      </details>
    </div>
  );
}
