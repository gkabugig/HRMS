// Area 09 §21 Manager Notification Workspace. See get-manager-notifications.ts
// for why this deliberately mixes the manager's own governed notifications
// (RLS-scoped to them) with separate, RLS-scoped team worklists rather than
// querying anything with elevated access.
import { createClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/manager/require-manager-context";
import { getNotifications } from "@/lib/notifications/actions";
import { getManagerNotificationWorkspace } from "@/lib/manager/get-manager-notifications";
import EmptyState from "@/components/employee-portal/empty-state";
import ManagerNotificationActions from "./manager-notification-actions";

const PRIORITY_STYLE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-100",
  action_required: "bg-amber-50 text-amber-700 border-amber-100",
  reminder: "bg-blue-50 text-blue-700 border-blue-100",
  information: "bg-neutral-50 text-neutral-500 border-neutral-100",
};

export default async function ManagerNotificationsPage() {
  const supabase = await createClient();
  await requireManagerContext(supabase);

  const { notifications } = await getNotifications();
  const workspace = await getManagerNotificationWorkspace(supabase, notifications);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Team Notifications</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Approvals and cases assigned to you, plus open items across your direct reports.
        </p>
      </div>

      <Section title="Pending approvals &amp; cases assigned to you" empty="Nothing assigned to you right now.">
        {workspace.ownNotifications.length > 0 && (
          <ManagerNotificationActions items={workspace.ownNotifications} />
        )}
      </Section>

      <Section title="Escalation queue" empty="No escalations outstanding.">
        {workspace.escalationQueue.length > 0 && (
          <ul role="list" className="divide-y divide-neutral-50">
            {workspace.escalationQueue.map((n) => (
              <li key={n.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${PRIORITY_STYLE[n.priority]}`}>
                  Stage {n.escalation_stage}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">{n.title}</p>
                  <p className="text-xs text-neutral-500">{n.safe_preview ?? n.message}</p>
                </div>
                {n.action_url && (
                  <a href={n.action_url} className="text-xs text-brand-600 hover:underline shrink-0">
                    {n.action_label ?? "Open"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Overdue team actions" empty="No overdue workflow tasks for your team.">
        {workspace.overdueTeamTasks.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {workspace.overdueTeamTasks.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-900">{t.task}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{t.entityType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2 text-amber-700 text-xs">{t.dueAt ? new Date(t.dueAt).toLocaleDateString("en-KE") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Open HR cases in your team" empty="No open cases from your direct reports.">
        {workspace.teamCasesNeedingInput.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">SLA due</th>
              </tr>
            </thead>
            <tbody>
              {workspace.teamCasesNeedingInput.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-900">{c.employeeName}</td>
                  <td className="px-4 py-2 text-neutral-700">{c.subject}</td>
                  <td className="px-4 py-2 text-neutral-700">{c.priority}</td>
                  <td className="px-4 py-2 text-neutral-700">{c.status}</td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{c.slaDueAt ? new Date(c.slaDueAt).toLocaleDateString("en-KE") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <p className="text-xs text-neutral-400">
        Document acknowledgements outstanding in your team aren&apos;t shown here: current policy only grants document
        acknowledgement visibility to the employee themselves and to HR/admin, not to line managers.
      </p>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900 mb-2">{title}</h2>
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        {hasContent ? children : <div className="p-4"><EmptyState message={empty} /></div>}
      </div>
    </section>
  );
}
