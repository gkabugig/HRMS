"use client";

// Area 09 §21 "Bulk acknowledgement/read operations must never perform the
// underlying HR action unless separately authorized." This component only
// ever calls markNotificationRead/markAllNotificationsRead — it marks the
// manager's own notification rows read, nothing more. Approving a step,
// resolving a case, or completing a task always happens on that item's own
// page (Approvals Centre, HR Service Centre, My Tasks), never from here.
import { useState } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/notification-types";

const PRIORITY_STYLE: Record<NotificationRow["priority"], string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  action_required: "bg-amber-50 text-amber-700 border-amber-100",
  reminder: "bg-blue-50 text-blue-700 border-blue-100",
  information: "bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border-neutral-100 dark:border-neutral-800",
};

export default function ManagerNotificationActions({ items: initial }: { items: NotificationRow[] }) {
  const [items, setItems] = useState(initial);
  const unread = items.filter((i) => !i.is_read).length;

  async function markOne(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    await markNotificationRead(id);
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await markAllNotificationsRead();
  }

  return (
    <div>
      {unread > 0 && (
        <div className="flex justify-end px-4 py-2 border-b border-[var(--border-subtle)]">
          <button onClick={markAll} className="text-xs text-brand-600 hover:underline" aria-label="Mark all of your notifications as read">
            Mark all read (notification state only)
          </button>
        </div>
      )}
      <ul role="list" className="divide-y divide-neutral-50">
        {items.map((n) => (
          <li key={n.id} className="px-4 py-3 flex items-start gap-3">
            <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${PRIORITY_STYLE[n.priority]}`}>
              {n.priority.replace("_", " ")}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium text-neutral-900 dark:text-neutral-50 ${n.is_read ? "opacity-70" : ""}`}>{n.title}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{n.safe_preview ?? n.message}</p>
            </div>
            {!n.is_read && (
              <button onClick={() => markOne(n.id)} className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-brand-600 shrink-0">
                Mark read
              </button>
            )}
            {n.action_url && (
              <a href={n.action_url} className="text-xs text-brand-600 hover:underline shrink-0">
                {n.action_label ?? "Open"}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
