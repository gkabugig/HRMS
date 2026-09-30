"use client";

// Switch between payroll runs from inside the command centre (spec §22
// header zone). A plain client-side navigate — server-rendered <Link>
// list would work too, but this keeps the header compact as a dropdown.
import { useRouter } from "next/navigation";

export default function PayrollPeriodSelector({
  runs,
  current,
}: {
  runs: { id: string; period: string }[];
  current: string;
}) {
  const router = useRouter();
  if (runs.length <= 1) return null;

  return (
    <select
      value={current}
      onChange={(e) => router.push(`/dashboard/payroll/${e.target.value}`)}
      className="text-sm font-medium bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
      aria-label="Payroll period"
    >
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {r.period}
        </option>
      ))}
    </select>
  );
}
