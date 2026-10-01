// Notifications & Action Centre (spec §11) is already a complete, working
// unified inbox at /dashboard/notifications (getNotifications/
// markNotificationRead/markAllNotificationsRead, preferences, deep links) —
// alias to it rather than rebuilding a second notification list.
import { redirect } from "next/navigation";

export default function MyNotificationsRedirect() {
  redirect("/dashboard/notifications");
}
