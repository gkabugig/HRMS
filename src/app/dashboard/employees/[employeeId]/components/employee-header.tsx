import Link from "next/link";
import type { Employee360 } from "@/lib/employees/get-employee-360";
import { EmployeeAvatar } from "./employee-avatar";

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  Terminated: "bg-neutral-200 text-neutral-600",
};

export function EmployeeHeader({ data, canEdit }: { data: Employee360; canEdit: boolean }) {
  const e = data.employee;
  const today = new Date().toISOString().slice(0, 10);
  const onProbation = e.probation_end_date && (e.probation_end_date as string) >= today;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-6">
      <Link href="/dashboard/employees" className="text-xs text-brand-600 hover:text-brand-700 hover:underline">
        ← Employees
      </Link>

      <div className="mt-3 flex flex-col sm:flex-row sm:items-start gap-4">
        <EmployeeAvatar name={e.name as string} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-neutral-900 truncate">{e.name as string}</h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                onProbation ? "bg-amber-100 text-amber-700" : STATUS_STYLES[e.status as string] ?? "bg-neutral-100 text-neutral-600"
              }`}
            >
              {onProbation ? "Probation" : (e.status as string)}
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {e.staff_no as string}
            {" • "}
            {e.job_title as string}
            {" • "}
            {e.department as string}
          </p>
          <p className="text-sm text-neutral-500">
            Joined {new Date(e.date_of_hire as string).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
            {data.manager && (
              <>
                {" • "}Reports to{" "}
                <Link href={`/dashboard/employees/${data.manager.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                  {data.manager.name}
                </Link>
              </>
            )}
          </p>
        </div>

        {canEdit && (
          <Link
            href="/dashboard/employees"
            className="shrink-0 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 text-sm font-medium"
          >
            Edit Employee
          </Link>
        )}
      </div>
    </div>
  );
}
