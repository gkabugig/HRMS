// Area 06 §19 "Organisation Context" — simple read-only view of where the
// manager sits: their own manager, their position, and their direct
// reports.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getManagerOrganisationContext } from "@/lib/manager/get-manager-organisation-context";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ManagerOrganisationPage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const data = await getManagerOrganisationContext(supabase, ctx.employeeId, scope.employeeIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Organisation Context</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Where you sit in the reporting structure.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">You report to</p>
        <p className="text-sm text-neutral-900 dark:text-neutral-50 mt-1">
          {data.ownManager ? `${data.ownManager.name} · ${data.ownManager.jobTitle}` : "No manager on file"}
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Your position</p>
        <p className="text-sm text-neutral-900 dark:text-neutral-50 mt-1">{data.self.jobTitle} · {data.self.department}</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Reports to you ({data.directReports.length})</h2>
        {data.directReports.length === 0 ? (
          <EmptyState message="No direct reports found." />
        ) : (
          <ul className="space-y-2">
            {data.directReports.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm border-b border-neutral-100 dark:border-neutral-800 pb-2 last:border-0">
                <Link href={`/dashboard/manager/team/${r.id}`} className="text-neutral-900 dark:text-neutral-50 hover:text-brand-600">{r.name}</Link>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{r.jobTitle}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
