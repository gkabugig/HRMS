import Link from "next/link";
import type { RecruitmentSnapshot as RecruitmentSnapshotData } from "@/lib/dashboard/dashboard-types";

export default function RecruitmentSnapshotCard({ recruitment }: { recruitment: RecruitmentSnapshotData }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full flex flex-col">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Recruitment</h2>
      {recruitment.openPositions === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 flex-1">No open positions.</p>
      ) : (
        <div className="space-y-1.5 flex-1">
          <Row label="Open positions" value={recruitment.openPositions} />
          <Row label="Candidates" value={recruitment.candidates} />
          <Row label="Screening" value={recruitment.screening} />
          <Row label="Interviews" value={recruitment.interviews} />
          <Row label="Offers" value={recruitment.offers} />
          <Row label="Hires" value={recruitment.hires} strong />
        </div>
      )}
      <Link href="/dashboard/recruitment" className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700">
        Open Recruitment →
      </Link>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`text-sm ${strong ? "font-semibold text-neutral-900 dark:text-neutral-50" : "text-neutral-700 dark:text-neutral-200"}`}>{value}</span>
    </div>
  );
}
