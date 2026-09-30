import Link from "next/link";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DashboardKPI } from "@/lib/dashboard/dashboard-types";

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };
const TREND_COLOR = { up: "text-emerald-600", down: "text-red-600", flat: "text-neutral-400" };

export default function KpiCard({ kpi }: { kpi: DashboardKPI }) {
  const TrendIcon = kpi.trend ? TREND_ICON[kpi.trend] : null;

  const content = (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full transition-colors hover:border-brand-200">
      <div className="text-xs font-medium text-neutral-500 mb-2">{kpi.label}</div>
      <div className="text-[28px] leading-tight font-semibold text-neutral-900 tracking-tight">{kpi.displayValue}</div>
      {kpi.changeLabel && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${kpi.trend ? TREND_COLOR[kpi.trend] : "text-neutral-500"}`}>
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
