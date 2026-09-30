import type { WorkforceAnalytics } from "@/lib/dashboard/dashboard-types";

// A minimal inline SVG line chart — no charting dependency needed for a
// single trend line, keeps the bundle light (spec §21 performance strategy).
function Sparkline({ points }: { points: { label: string; value: number }[] }) {
  if (points.length === 0) return null;
  const width = 100;
  const height = 32;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(points.length - 1, 1);

  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p.value - min) / range) * height;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-24">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="var(--color-brand-600, #4f46e5)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function WorkforceTrend({ workforce }: { workforce: WorkforceAnalytics }) {
  const first = workforce.headcountTrend[0]?.label;
  const last = workforce.headcountTrend[workforce.headcountTrend.length - 1]?.label;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-neutral-900">Workforce Trend</h2>
        {workforce.turnoverRate12mo !== null && (
          <span className="text-xs text-neutral-500">Turnover (12mo): {workforce.turnoverRate12mo}%</span>
        )}
      </div>
      {workforce.headcountTrend.length > 0 ? (
        <>
          <Sparkline points={workforce.headcountTrend} />
          <div className="flex justify-between text-xs text-neutral-400 mt-1">
            <span>{first}</span>
            <span>{last}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-neutral-400 py-8 text-center">Not enough data yet.</p>
      )}
    </div>
  );
}
