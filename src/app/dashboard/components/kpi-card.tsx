import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DashboardKPI } from "@/lib/dashboard/dashboard-types";

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };
const TREND_COLOR = { up: "text-emerald-600", down: "text-red-600", flat: "text-neutral-400 dark:text-neutral-500" };

const ACCENTS = ["var(--vivid-1)", "var(--vivid-3)", "var(--vivid-4)", "var(--vivid-2)", "var(--vivid-5)", "var(--vivid-6)", "var(--vivid-7)", "var(--vivid-8)"];

export default function KpiCard({ kpi, index = 0 }: { kpi: DashboardKPI; index?: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const TrendIcon = kpi.trend ? TREND_ICON[kpi.trend] : null;

  const content = (
    <div
      className="relative overflow-hidden bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 10%, var(--surface)), var(--surface) 65%)` }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">{kpi.label}</div>
      <div className="text-[28px] leading-tight font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{kpi.displayValue}</div>
      {kpi.changeLabel && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${kpi.trend ? TREND_COLOR[kpi.trend] : "text-neutral-500 dark:text-neutral-400"}`}>
          {TrendIcon && <TrendIcon size={13} strokeWidth={2.5} />}
          <span>{kpi.changeLabel}</span>
        </div>
      )}
    </div>
  );

  if (!kpi.href || kpi.href === "#action-centre") {
    return kpi.href === "#action-centre" ? <a href={kpi.href}>{content}</a> : content;
  }
  return <Link href={kpi.href}>{content}</Link>;
}
