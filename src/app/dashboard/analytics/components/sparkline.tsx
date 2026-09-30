import type { TrendPoint } from "@/lib/intelligence/metrics/metric-types";

// Reused pattern from dashboard/components/workforce-trend.tsx — a minimal
// inline SVG line chart, no charting dependency needed.
export default function Sparkline({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-neutral-400 py-8 text-center">Not enough history yet — check back after a few more visits.</p>;
  }
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
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-24">
        <polyline points={coords.join(" ")} fill="none" stroke="var(--color-brand-600, #4f46e5)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-neutral-400 mt-1">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
