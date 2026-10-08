import type { ReactNode } from "react";

// Small building blocks shared by the newer screens, matching the look of the rest of the app.
export const INPUT = "border border-[var(--border-subtle)] bg-[var(--surface)] rounded-lg px-2.5 py-1.5 text-sm text-neutral-900 dark:text-neutral-50 w-full";
export const LABEL = "block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1";
export const BTN = "text-xs font-medium rounded-lg px-3 py-1.5 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50";
export const BTN_GHOST = "text-xs font-medium rounded-lg px-3 py-1.5 border border-[var(--border-subtle)] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 hover:dark:bg-neutral-900";
export const BTN_DANGER = "text-xs font-medium rounded-lg px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50";

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">{children}</p>;
}

const CHIP: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};
export function Chip({ tone = "neutral", children }: { tone?: keyof typeof CHIP; children: ReactNode }) {
  return <span className={`inline-block text-[11px] font-medium rounded-full px-2 py-0.5 ${CHIP[tone]}`}>{children}</span>;
}

export function TabLinks({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
            current === t.href ? "bg-brand-600 text-white border-brand-600" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 hover:dark:bg-neutral-900"
          }`}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }) : "—");
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : "—";
