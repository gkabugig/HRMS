import Link from "next/link";
import type { ActivityItem } from "@/lib/dashboard/dashboard-types";

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export default function RecentActivity({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Recent Activity</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing material has happened yet.</p>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
              {a.href ? (
                <Link href={a.href} className="text-neutral-700 dark:text-neutral-200 hover:text-brand-700 flex-1">
                  {a.description}
                </Link>
              ) : (
                <span className="text-neutral-700 dark:text-neutral-200 flex-1">{a.description}</span>
              )}
              <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">{timeAgo(a.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
