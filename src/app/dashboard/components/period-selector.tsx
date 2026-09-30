"use client";

// Global period control (spec §12). Widgets each use their own natural
// period by default (Today for attendance, a rolling window for trends);
// the one widget genuinely period-driven by user choice is the Payroll
// Snapshot, so this selector picks which payroll run to view and reflects
// that in the URL (?period=YYYY-MM) rather than pretending every widget
// shares one global clock — the spec itself says not to do that ("Not
// every widget should obey the same period").
import { useRouter, useSearchParams } from "next/navigation";

function label(period: string): string {
  const d = new Date(`${period}-01`);
  return d.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

export default function PeriodSelector({ availablePeriods, current }: { availablePeriods: string[]; current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (availablePeriods.length === 0) return null;

  function onChange(period: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-medium bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
      aria-label="Payroll period"
    >
      {availablePeriods.map((p) => (
        <option key={p} value={p}>
          {label(p)}
        </option>
      ))}
    </select>
  );
}
