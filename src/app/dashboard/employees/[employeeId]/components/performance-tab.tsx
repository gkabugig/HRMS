import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

const STATUS_STYLES: Record<string, string> = {
  "In Progress": "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
};

export function PerformanceTab({ data }: { data: Employee360 }) {
  const p = data.performance;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Latest Score</h2>
        <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {p.latest?.final_score != null ? `${p.latest.final_score} / 5` : "No completed appraisal yet"}
        </p>
        {p.latest && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {p.latest.cycle} —{" "}
            <span className={`px-1.5 py-0.5 rounded ${STATUS_STYLES[p.latest.status] ?? ""}`}>{p.latest.status}</span>
          </p>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Appraisal Cycles</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Cycle</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {p.recent.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">{a.cycle}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[a.status] ?? ""}`}>{a.status}</span>
                </td>
                <td className="px-4 py-2">{a.final_score ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/dashboard/performance/${a.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {p.recent.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No appraisals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
