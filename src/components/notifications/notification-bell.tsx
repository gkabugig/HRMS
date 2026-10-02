"use client";

// Notification centre (spec Part IV). Polls unread count periodically and
// fetches the full list only when the panel opens, so it never pulls the
// full notification history onto every page load (spec §34: "fetch a
// small recent window with unread count").
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { NotificationRow } from "@/lib/notifications/notification-types";

const PRIORITY_DOT: Record<NotificationRow["priority"], string> = {
  critical: "bg-red-500",
  action_required: "bg-amber-500",
  reminder: "bg-blue-400",
  information: "bg-neutral-300 dark:bg-neutral-600",
};

const PRIORITY_LABEL: Record<NotificationRow["priority"], string> = {
  critical: "Critical",
  action_required: "Action required",
  reminder: "Reminder",
  information: "Information",
};

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refreshCount = useCallback(() => {
    getNotifications().then((res) => setUnreadCount(res.unreadCount));
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 60000);
    return () => clearInterval(id);
  }, [refreshCount]);

  const openPanel = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next) {
        setLoading(true);
        getNotifications()
          .then((res) => {
            setItems(res.notifications);
            setUnreadCount(res.unreadCount);
          })
          .finally(() => setLoading(false));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onItemClick(n: NotificationRow) {
    if (!n.is_read) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)));
      setUnreadCount((c) => Math.max(0, c - 1));
      await markNotificationRead(n.id);
    }
    setOpen(false);
    if (n.action_url) router.push(n.action_url);
  }

  async function onMarkAll() {
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    setUnreadCount(0);
    await markAllNotificationsRead();
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={openPanel}
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 hover:dark:border-neutral-600 transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[90vw] bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Notifications</h2>
            {unreadCount > 0 && (
              <button onClick={onMarkAll} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500 text-center">Loading…</p>}
            {!loading && items.length === 0 && (
              <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500 text-center">You&apos;re all caught up.</p>
            )}
            {!loading &&
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-neutral-50 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 hover:dark:bg-neutral-900 transition-colors flex gap-2.5 ${
                    n.is_read ? "opacity-70" : ""
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[n.priority]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">{n.title}</span>
                      {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />}
                    </span>
                    <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{n.safe_preview ?? n.message}</span>
                    <span className="block text-[10px] text-neutral-400 dark:text-neutral-500 mt-1 uppercase tracking-wide">
                      {PRIORITY_LABEL[n.priority]} · {timeAgo(n.created_at)}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
