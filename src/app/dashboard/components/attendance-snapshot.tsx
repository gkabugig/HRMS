import Link from "next/link";
import type { AttendanceSnapshot as AttendanceSnapshotData } from "@/lib/dashboard/dashboard-types";

export default function AttendanceSnapshotCard({ attendance }: { attendance: AttendanceSnapshotData }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full flex flex-col">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Attendance — Today</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 flex-1">
        <Stat label="Present" value={attendance.present} pct={attendance.presentPct} />
        <Stat label="Late" value={attendance.late} pct={attendance.latePct} tone="warn" />
        <Stat label="Absent" value={attendance.absent} pct={attendance.absentPct} tone="critical" />
        <Stat label="On Leave" value={attendance.onLeave} />
      </div>
      {attendance.missingClockOut > 0 && (
        <p className="text-[11px] text-amber-600 mt-2">{attendance.missingClockOut} missing clock-out</p>
      )}
      <div className="flex items-end gap-0.5 mt-3 h-8">
        {attendance.trend7day.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.label}: ${d.presentPct ?? "—"}%`}>
            <div
              className="w-full rounded-sm bg-brand-200"
              style={{ height: `${Math.max(4, ((d.presentPct ?? 0) / 100) * 32)}px` }}
            />
          </div>
        ))}
      </div>
      <Link href="/dashboard/attendance" className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">
        View exceptions →
      </Link>
    </div>
  );
}

function Stat({ label, value, pct, tone }: { label: string; value: number; pct?: number | null; tone?: "warn" | "critical" }) {
  const color = tone === "critical" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-neutral-900 dark:text-neutral-50";
  return (
    <div>
      <div className={`text-lg font-semibold ${color}`}>
        {value}
        {pct !== undefined && pct !== null && <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500 ml-1">{pct}%</span>}
      </div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}
