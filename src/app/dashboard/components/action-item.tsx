import Link from "next/link";
import type { DashboardAlert } from "@/lib/dashboard/dashboard-types";

const DOT = { critical: "bg-red-500", warning: "bg-amber-500", info: "bg-brand-500" };

export default function ActionItem({ alert }: { alert: DashboardAlert }) {
  return (
    <Link
      href={alert.href}
      className="flex items-start gap-3 px-4 py-3 hover:bg-neutral-50 hover:dark:bg-neutral-900 transition-colors group"
    >
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${DOT[alert.severity]}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">{alert.title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{alert.description}</div>
      </div>
      <span className="text-xs font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
        {alert.actionLabel}
      </span>
    </Link>
  );
}
