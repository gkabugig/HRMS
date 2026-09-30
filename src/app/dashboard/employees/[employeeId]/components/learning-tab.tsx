import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

const STATUS_STYLES: Record<string, string> = {
  Enrolled: "bg-amber-100 text-amber-700",
  Completed: "bg-emerald-100 text-emerald-700",
};

export function LearningTab({ data }: { data: Employee360 }) {
  const l = data.learning;

  return (
    <div className="space-y-6">
      {l.overdueMandatory.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-700 mb-2">Overdue Mandatory Training</h2>
          <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
            {l.overdueMandatory.map((t) => (
              <li key={t.id}>{t.courseName}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <Link href="/dashboard/ld" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
          Open Learning &amp; Development →
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900">Enrollments</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Course</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Enrolled</th>
              <th className="px-4 py-2 font-medium">Completed</th>
            </tr>
          </thead>
          <tbody>
            {l.enrollments.map((e) => (
              <tr key={e.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{e.course_name}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[e.status] ?? ""}`}>{e.status}</span>
                </td>
                <td className="px-4 py-2">{e.enrolled_on}</td>
                <td className="px-4 py-2">{e.completed_on ?? "—"}</td>
              </tr>
            ))}
            {l.enrollments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  No enrollments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
