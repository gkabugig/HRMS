import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

// Shared shell for dashboard chart cards: a coloured accent edge, a title
// that links to the source module, and room for the chart + a footer link.
export default function ChartCard({
  title,
  subtitle,
  href,
  linkLabel,
  accent = "var(--vivid-1)",
  children,
}: {
  title: string;
  subtitle?: string;
  href: string;
  linkLabel: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full flex flex-col overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 40%, white))` }} />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium rounded-full px-2.5 py-1 transition-colors hover:brightness-95"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          {linkLabel}
          <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
