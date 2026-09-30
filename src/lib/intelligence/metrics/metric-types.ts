// Shared types for the Phase 3 metric layer (spec §4.2). A "computed
// metric" is the live, on-demand value for the current period; a
// "trend point" comes from metric_snapshots, written opportunistically
// each time a dashboard is viewed (this app has no background job
// runner — see notification-rules.ts for the same pattern used for
// reminder sweeps).

export type MetricUnit = "count" | "currency" | "percent" | "days" | "ratio";

export type MetricDefinition = {
  key: string;
  name: string;
  description: string;
  formula: string;
  population: string;
  exclusions: string | null;
  unit: MetricUnit;
  category: string;
  refreshFrequency: string;
};

export type ComputedMetric = {
  key: string;
  value: number;
  populationCount: number | null;
  definition: MetricDefinition | null;
};

export type TrendPoint = { label: string; value: number };

export type SegmentBreakdown = {
  segmentLabel: string;
  segmentValue: string;
  value: number;
  populationCount: number;
};

export function formatMetricValue(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "currency":
      return `KES ${Math.round(value).toLocaleString()}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    case "days":
      return `${value.toFixed(1)} days`;
    case "ratio":
      return value.toFixed(2);
    case "count":
    default:
      return Math.round(value).toLocaleString();
  }
}
