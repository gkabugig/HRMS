import Link from "next/link";
import type { LeaveView } from "@/lib/leave/leave-types";

const VIEW_LABELS: Record<LeaveView, string> = {
  my: "My Leave",
  team: "Team Calendar",
  company: "Company Calendar",
  requests: "Requests",
  balances: "Balances",
};

export function LeaveToolbar({ views, active, month }: { views: LeaveView[]; active: LeaveView; month?: string }) {
  const monthParam = month ? `&month=${month}` : "";
  return (
    <div className="border-b border-[var(--border-subtle)] overflow-x-auto">
      <nav className="flex gap-1 min-w-max">
        {views.map((v) => (
          <Link
            key={v}
            href={`/dashboard/leave?view=${v}${monthParam}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              v === active ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function MonthNav({ view, month }: { view: LeaveView; month: string }) {
  const [y, m] = month.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const next = new Date(y, m, 1);
  const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  const label = new Date(y, m - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href={`/dashboard/leave?view=${view}&month=${prevStr}`} className="px-2 py-1 rounded border border-[var(--border-subtle)] text-neutral-500 hover:border-neutral-300">
        ‹
      </Link>
      <span className="font-medium text-neutral-800 min-w-[9rem] text-center">{label}</span>
      <Link href={`/dashboard/leave?view=${view}&month=${nextStr}`} className="px-2 py-1 rounded border border-[var(--border-subtle)] text-neutral-500 hover:border-neutral-300">
        ›
      </Link>
    </div>
  );
}
