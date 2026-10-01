"use client";

import { useMemo, useState } from "react";
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

// Area 09 §20 "Tabs/filters: All, Action Required, Approvals, HR Cases,
// Documents, Announcements." Mapped onto this repo's actual category/
// requires_action fields rather than inventing a parallel taxonomy —
// "Announcements" covers everything that isn't workflow/case/document
// (system, self_service, leave, payroll, etc.), matching what's left once
// the other four tabs claim their slice.
type TabKey = "all" | "action_required" | "approval" | "service_request" | "documents" | "announcements";
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "action_required", label: "Action required" },
  { key: "approval", label: "Approvals" },
  { key: "service_request", label: "HR cases" },
  { key: "documents", label: "Documents" },
  { key: "announcements", label: "Announcements" },
];

function matchesTab(n: NotificationRow, tab: TabKey): boolean {
  switch (tab) {
    case "all":
      return true;
    case "action_required":
      return n.requires_action || n.priority === "action_required" || n.priority === "critical";
    case "approval":
      return n.category === "approval";
    case "service_request":
      return n.category === "service_request";
    case "documents":
      return n.category === "documents";
    case "announcements":
      return !["approval", "service_request", "documents"].includes(n.category);
  }
}

export default function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<TabKey>("all");
  const router = useRouter();
  const unread = items.filter((i) => !i.is_read).length;
  const visible = useMemo(() => items.filter((n) => matchesTab(n, tab)), [items, tab]);

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

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <div
        role="tablist"
        aria-label="Filter notifications"
        className="flex gap-1 px-2 pt-2 overflow-x-auto border-b border-[var(--border-subtle)]"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 text-xs font-medium px-3 py-2 rounded-t-lg transition-colors ${
              tab === t.key ? "bg-brand-50 text-brand-700" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {unread > 0 && (
        <div className="flex justify-end px-4 py-2 border-b border-[var(--border-subtle)]">
          <button onClick={onMarkAll} className="text-xs text-brand-600 hover:underline flex items-center gap-1" aria-label="Mark all notifications as read">
            <Check size={12} /> Mark all read
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="p-8 text-center text-sm text-neutral-400">
          {items.length === 0 ? "You're all caught up — no notifications yet." : "Nothing in this view."}
        </div>
      ) : (
        <ul role="list" aria-label="Notifications">
          {visible.map((n) => (
            <li key={n.id} className="border-b border-neutral-50 last:border-0">
              <button
                onClick={() => onClick(n)}
                aria-label={`${n.is_read ? "Read" : "Unread"} notification: ${n.title}. ${PRIORITY_LABEL[n.priority]}.${n.action_url ? " Activates the related page." : ""}`}
                className={`w-full text-left px-4 py-3 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 transition-colors flex flex-col sm:flex-row sm:items-center gap-2 ${
                  n.is_read ? "opacity-70" : ""
                }`}
              >
                <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${PRIORITY_STYLE[n.priority]}`}>
                  {PRIORITY_LABEL[n.priority]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">{n.title}</span>
                    {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" aria-hidden="true" />}
                    {n.is_mandatory && (
                      <span className="text-[10px] text-neutral-400 border border-neutral-200 rounded px-1" title="This is a mandatory notification and cannot be opted out of.">
                        Mandatory
                      </span>
                    )}
                  </span>
                  {/* Safe preview only (spec §20/§2) — never the raw internal `message`,
                      which may carry detail not meant for a casual glance at the list. */}
                  <span className="block text-xs text-neutral-500 mt-0.5">{n.safe_preview ?? n.message}</span>
                </span>
                <span className="text-[11px] text-neutral-400 shrink-0">{new Date(n.created_at).toLocaleString("en-KE")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
