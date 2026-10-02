import Link from "next/link";
import type { EmployeeAlert } from "@/lib/employees/alerts";

const SEVERITY_STYLES: Record<EmployeeAlert["severity"], string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  warning: "bg-amber-50 text-amber-700 border-amber-100",
  info: "bg-blue-50 text-blue-700 border-blue-100",
};

export function AttentionCard({ alerts }: { alerts: EmployeeAlert[] }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Needs Attention</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing outstanding.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id} className={`text-sm border rounded-lg px-3 py-2 ${SEVERITY_STYLES[a.severity]}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.description}</p>
                </div>
                {a.href && (
                  <Link href={a.href} className="text-xs font-medium underline shrink-0">
                    {a.actionLabel ?? "Review"}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
