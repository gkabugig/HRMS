import { CheckCircle2 } from "lucide-react";
import type { DashboardAlert } from "@/lib/dashboard/dashboard-types";
import ActionItem from "./action-item";

export default function ActionCentre({ alerts }: { alerts: DashboardAlert[] }) {
  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warning = alerts.filter((a) => a.severity === "warning").length;

  return (
    <div id="action-centre" className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] overflow-hidden h-full flex flex-col">
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Action Centre</h2>
        {alerts.length > 0 && (
          <span className="text-xs text-neutral-500">
            {critical > 0 && <span className="text-red-600 font-medium">{critical} critical</span>}
            {critical > 0 && warning > 0 && " · "}
            {warning > 0 && <span>{warning} warning</span>}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto max-h-[340px] divide-y divide-neutral-50">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <CheckCircle2 size={28} className="text-emerald-500 mb-2" strokeWidth={1.5} />
            <p className="text-sm text-neutral-500">All caught up — nothing needs your attention.</p>
          </div>
        ) : (
          alerts.slice(0, 10).map((a) => <ActionItem key={a.id} alert={a} />)
        )}
      </div>
    </div>
  );
}
