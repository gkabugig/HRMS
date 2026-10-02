import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PayrollKpi } from "@/lib/payroll/command-centre-types";

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus };
const TREND_COLOR = { up: "text-emerald-600", down: "text-red-600", flat: "text-neutral-400 dark:text-neutral-500" };

export default function PayrollKpis({ kpis }: { kpis: PayrollKpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      {kpis.map((k) => {
        const TrendIcon = k.trend ? TREND_ICON[k.trend] : null;
        return (
          <div key={k.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-4">
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">{k.label}</div>
            <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{k.displayValue}</div>
            {k.changeLabel && (
              <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${k.trend ? TREND_COLOR[k.trend] : "text-neutral-500 dark:text-neutral-400"}`}>
                {TrendIcon && <TrendIcon size={11} strokeWidth={2.5} />}
                <span>{k.changeLabel}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
