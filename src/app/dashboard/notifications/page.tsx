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
};

export default async function NotificationsPage() {
  const [{ notifications, unreadCount }, preferences] = await Promise.all([
    getNotifications(),
    getNotificationPreferences(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">Notifications</h1>
        {unreadCount > 0 && <span className="text-xs text-neutral-500">{unreadCount} unread</span>}
      </div>
      <NotificationList initial={notifications} />

      <details className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03]">
        <summary className="px-4 py-3 text-sm font-semibold text-neutral-900 cursor-pointer">Notification preferences</summary>
        <form action={updateNotificationPreferences} className="px-4 pb-4 pt-1 text-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-center">In-app</th>
                  <th className="px-3 py-2 font-medium text-center">Email</th>
                </tr>
              </thead>
              <tbody>
                {preferences.map((p) => (
                  <tr key={p.notification_type} className="border-t border-neutral-100">
                    <td className="px-3 py-2">{CATEGORY_LABELS[p.notification_type] ?? p.notification_type}</td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" name={`${p.notification_type}_in_app`} defaultChecked={p.in_app} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" name={`${p.notification_type}_email`} defaultChecked={p.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-400 mt-2 mb-3">
            Critical notifications (payroll blocks, compliance expiry) always show in-app regardless of these settings.
          </p>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
            Save preferences
          </button>
        </form>
      </details>
    </div>
  );
}
