// Area 05 §12 "My Tasks" — human tasks assigned to the current user only
// (Area 02 approval steps + legacy Area 03 workflow_tasks — see
// get-my-tasks.ts for exactly why those are the only two sources). Opens
// directly into the module that owns the action (the universal Approvals
// inbox, which re-checks authorization server-side on every decision via
// decideApprovalStep — "re-check authorization server-side at action time",
// spec §12). Delegation is Area 02's own — nothing here invents a second
// delegation rule.
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyTasks } from "@/lib/employee-portal/get-my-tasks";
import EmptyState from "@/components/employee-portal/empty-state";
import Link from "next/link";

export default async function MyTasksPage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const tasks = await getMyTasks(supabase, ctx.userId, ctx.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Tasks</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Approvals and workflow tasks assigned to you.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-4"><EmptyState message="Nothing assigned to you right now." /></div>
        ) : (
          <ul>
            {tasks.map((t) => (
              <li key={`${t.source}-${t.id}`} className="border-t border-neutral-100 dark:border-neutral-800 first:border-0 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">
                    {t.source === "approval" ? (t.requestType ?? "Approval").replace(/_/g, " ") : "Workflow task"}
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-neutral-50">{t.title}</p>
                  {t.dueAt && <p className="text-xs text-neutral-500 dark:text-neutral-400">Due {new Date(t.dueAt).toLocaleDateString("en-KE")}</p>}
                </div>
                <Link href={t.actionUrl} className="text-xs font-medium text-brand-600 hover:underline">Open →</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
