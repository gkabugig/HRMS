import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
}

export function ComplianceTab({ data, canSeeDisciplinary }: { data: Employee360; canSeeDisciplinary: boolean }) {
  const c = data.compliance;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{c.documents.length}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Tracked compliance documents</p>
        </div>
        {canSeeDisciplinary && (
          <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{c.disciplinaryCount}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Disciplinary records</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Link href="/dashboard/compliance" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
          Open full Compliance module →
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Compliance Documents</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {c.documents.map((d) => {
              const days = daysUntil(d.expiry_date);
              return (
                <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{d.doc_type}</td>
                  <td className="px-4 py-2">{d.label}</td>
                  <td className="px-4 py-2">
                    {d.expiry_date}{" "}
                    {days <= 30 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ml-1 ${days < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {days < 0 ? "Expired" : `${days}d`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {c.documents.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No compliance documents tracked for this employee.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
