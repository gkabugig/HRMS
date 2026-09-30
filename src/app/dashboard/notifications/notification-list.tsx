"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/notification-types";

const PRIORITY_STYLE: Record<NotificationRow["priority"], string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  action_required: "bg-amber-50 text-amber-700 border-amber-100",
  reminder: "bg-blue-50 text-blue-700 border-blue-100",
  information: "bg-neutral-50 text-neutral-500 border-neutral-100",
};

const PRIORITY_LABEL: Record<NotificationRow["priority"], string> = {
  critical: "Critical",
  action_required: "Action required",
  reminder: "Reminder",
  information: "Information",
};

export default function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const [items, setItems] = useState(initial);
  const router = useRouter();
  const unread = items.filter((i) => !i.is_read).length;

  async function onClick(n: NotificationRow) {
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      await markNotificationRead(n.id);
    }
    if (n.action_url) router.push(n.action_url);
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    await markAllNotificationsRead();
  }

  if (items.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-8 text-center text-sm text-neutral-400">
        You&apos;re all caught up — no notifications yet.
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      {unread > 0 && (
        <div className="flex justify-end px-4 py-2 border-b border-[var(--border-subtle)]">
          <button onClick={onMarkAll} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            <Check size={12} /> Mark all read
          </button>
        </div>
      )}
      <ul>
        {items.map((n) => (
          <li key={n.id} className="border-b border-neutral-50 last:border-0">
            <button
              onClick={() => onClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 ${
                n.is_read ? "opacity-70" : ""
              }`}
            >
              <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${PRIORITY_STYLE[n.priority]}`}>
                {PRIORITY_LABEL[n.priority]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{n.title}</span>
                  {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />}
                </span>
                <span className="block text-xs text-neutral-500 mt-0.5">{n.message}</span>
              </span>
              <span className="text-[11px] text-neutral-400 shrink-0">{new Date(n.created_at).toLocaleString("en-KE")}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
