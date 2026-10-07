import type { DashboardKPI } from "@/lib/dashboard/dashboard-types";
import KpiCard from "./kpi-card";

export default function KpiGrid({ kpis }: { kpis: DashboardKPI[] }) {
  if (kpis.length === 0) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k, i) => (
        <KpiCard key={k.id} kpi={k} index={i} />
      ))}
    </div>
  );
}
