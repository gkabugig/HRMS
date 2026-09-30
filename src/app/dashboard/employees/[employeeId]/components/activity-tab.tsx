import type { Employee360 } from "@/lib/employees/get-employee-360";

export function ActivityTab({ data }: { data: Employee360 }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-sm font-semibold text-neutral-900">Activity</h2>
      </div>
      <ul className="divide-y divide-neutral-50">
        {data.activity.map((a) => (
          <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3 text-sm">
            <div>
              <p className="text-neutral-900 capitalize">{a.title}</p>
              {a.description && <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>}
            </div>
            <span className="text-xs text-neutral-400 shrink-0">
              {new Date(a.at).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </li>
        ))}
        {data.activity.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-neutral-400">No recorded activity yet.</li>
        )}
      </ul>
    </div>
  );
}
