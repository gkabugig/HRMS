import Link from "next/link";
import type { SegmentBreakdown } from "@/lib/intelligence/metrics/metric-types";
import { formatMetricValue } from "@/lib/intelligence/metrics/metric-types";
import type { MetricUnit } from "@/lib/intelligence/metrics/metric-types";

// Segment-by breakdown with a drill-through link (spec §4.3: "Click-through
// from metric -> segment -> employee-level records where permission
// allows"). Always shows the population count behind the number, per spec.
export default function SegmentTable({ title, rows, unit }: { title: string; rows: SegmentBreakdown[]; unit: MetricUnit }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-400 p-5">No data yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-5 py-2 font-medium">Department</th>
              <th className="px-5 py-2 font-medium">Value</th>
              <th className="px-5 py-2 font-medium">Population</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.segmentValue} className="border-t border-neutral-100">
                <td className="px-5 py-2">
                  <Link href={`/dashboard/employees?department=${encodeURIComponent(r.segmentValue)}`} className="text-brand-600 hover:underline">
                    {r.segmentLabel}
                  </Link>
                </td>
                <td className="px-5 py-2 font-medium text-neutral-900">{formatMetricValue(r.value, unit)}</td>
                <td className="px-5 py-2 text-neutral-500">{r.populationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
