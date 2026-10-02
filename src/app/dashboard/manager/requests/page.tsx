// Area 06 §14 "Team Requests" — service requests raised by the manager's
// direct reports, read-only visibility (actioning/resolving a request is
// HR Service Centre's job, not this workspace's — spec's Implementation
// Boundary excludes "advanced HR Service Centre").
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getManagerScope } from "@/lib/manager/get-manager-scope";
import { getManagerRequests } from "@/lib/manager/get-manager-requests";
import EmptyState from "@/components/employee-portal/empty-state";

const STATUS_STYLE: Record<string, string> = {
  Submitted: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  Triaged: "bg-blue-100 text-blue-700",
  Assigned: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Waiting for Employee": "bg-amber-100 text-amber-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500",
};

export default async function ManagerRequestsPage() {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);
  const scope = await getManagerScope(supabase, ctx.employeeId, ctx.orgId);
  const requests = await getManagerRequests(supabase, scope.employeeIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Team Requests</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Service requests raised by your direct reports.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {requests.length === 0 ? (
          <div className="p-4"><EmptyState message="No requests from your team." /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Raised</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 text-neutral-900 dark:text-neutral-50">{r.employeeName}</td>
                  <td className="px-4 py-2 text-neutral-700 dark:text-neutral-200">{r.subject}</td>
                  <td className="px-4 py-2 text-neutral-700 dark:text-neutral-200">{r.priority}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 text-xs">{new Date(r.createdAt).toLocaleDateString("en-KE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
