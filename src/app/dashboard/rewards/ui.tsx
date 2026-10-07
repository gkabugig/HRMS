import Link from "next/link";
import type { ReactNode } from "react";

export const INPUT = "border border-[var(--border-subtle)] bg-[var(--surface)] rounded-lg px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-50 w-full";
export const LABEL = "block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1";
export const BTN = "text-xs font-medium rounded-lg px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50";
export const BTN_GHOST = "text-xs font-medium rounded-lg px-3 py-1.5 border border-[var(--border-subtle)] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 hover:dark:bg-neutral-900";

export const kes = (n: number | string | null | undefined) => `KES ${Math.round(Number(n ?? 0)).toLocaleString("en-KE")}`;

const STATUS_STYLE: Record<string, string> = {
  Planning: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  Draft: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  Open: "bg-blue-100 text-blue-700",
  "In Review": "bg-amber-100 text-amber-700",
  Calibration: "bg-purple-100 text-purple-700",
  Approval: "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Deferred: "bg-orange-100 text-orange-700",
  Finalised: "bg-emerald-100 text-emerald-700",
  Paid: "bg-teal-100 text-teal-700",
  Rejected: "bg-red-100 text-red-700",
};

export function StatusChip({ status }: { status: string }) {
  return <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${STATUS_STYLE[status] ?? STATUS_STYLE.Draft}`}>{status}</span>;
}

export function Panel({ title, subtitle, children, right }: { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>}
            {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

const TABS = [
  { href: "/dashboard/rewards", label: "Overview" },
  { href: "/dashboard/rewards/recommendations", label: "Recommendations" },
  { href: "/dashboard/rewards/schemes", label: "Incentive schemes" },
  { href: "/dashboard/rewards/spot", label: "Spot awards" },
  { href: "/dashboard/rewards/promotions", label: "Promotions" },
  { href: "/dashboard/rewards/history", label: "Reward history" },
  { href: "/dashboard/rewards/calibration", label: "Calibration", hr: true },
  { href: "/dashboard/rewards/fairness", label: "Fairness", hr: true },
  { href: "/dashboard/rewards/policy", label: "Policy", hr: true },
  { href: "/dashboard/rewards/audit", label: "Audit log", hr: true },
];

export function RewardsNav({ role, current }: { role: string; current: string }) {
  const isHr = role === "admin" || role === "hr";
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.filter((t) => !t.hr || isHr).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
            current === t.href ? "bg-brand-600 text-white border-brand-600" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 hover:dark:bg-neutral-900"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function PageHead({ title, subtitle, role, current }: { title: string; subtitle: string; role: string; current: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{title}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{subtitle}</p>
      </div>
      <RewardsNav role={role} current={current} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">{children}</p>;
}

export function Meter({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const over = total > 0 && used > total;
  return (
    <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden" title={`${pct}%`}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--vivid-2)" : pct >= 90 ? "var(--vivid-4)" : "var(--vivid-3)" }} />
    </div>
  );
}
