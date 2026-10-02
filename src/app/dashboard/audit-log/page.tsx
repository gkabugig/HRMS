import { createClient } from "@/lib/supabase/server";
import { getAuditTrail, distinctResourceTypes, type AuditEventCategory, type AuditRiskLevel } from "@/lib/audit/get-audit-trail";
import AuditEventsTable from "./audit-events-table";

// Audit Centre (Phase 2 spec Part 1). Two sections on one page rather than
// two nav entries: the new cross-module audit_events trail (filterable,
// with before/after detail) as the primary view, and the pre-existing
// employee-field-change log kept exactly as it was — still useful for "what
// changed on this employee record" but narrower than the new trail, so it's
// folded in here instead of living at a separate URL.
const CATEGORIES: AuditEventCategory[] = [
  "authentication", "access", "data", "workflow", "approval", "security", "export", "configuration",
];
const RISK_LEVELS: AuditRiskLevel[] = ["normal", "elevated", "high"];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: legacyRows }, events, { data: workflowRuns }] = await Promise.all([
    supabase
      .from("employee_audit_log")
      .select("changed_at, field, old_value, new_value, employees(name, staff_no)")
      .order("changed_at", { ascending: false })
      .limit(100),
    getAuditTrail(supabase, {
      dateFrom: params.from || undefined,
      dateTo: params.to || undefined,
      eventCategory: (params.category as AuditEventCategory) || undefined,
      resourceType: params.resource || undefined,
      riskLevel: (params.risk as AuditRiskLevel) || undefined,
      q: params.q || undefined,
    }),
    supabase
      .from("workflow_runs")
      .select("id, entity_type, entity_id, status, started_at, completed_at, workflow_definitions(name), workflow_tasks(task, status)")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  const resourceTypes = distinctResourceTypes(events);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Audit Centre</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Every recorded action across the system, most recent first. Admin/HR only, and read-only —
          nothing here can be edited or deleted.
        </p>
      </div>

      <AuditEventsTable
        events={events}
        resourceTypes={resourceTypes}
        categories={CATEGORIES}
        riskLevels={RISK_LEVELS}
        filters={{
          from: params.from ?? "",
          to: params.to ?? "",
          category: params.category ?? "",
          resource: params.resource ?? "",
          risk: params.risk ?? "",
          q: params.q ?? "",
        }}
      />

      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Employee field changes</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Legacy log of individual field edits made from the Employees screen. Superseded going forward by the
          trail above (Employees edits are also recorded there as <code className="font-mono">data</code> events) —
          kept here for the existing history.
        </p>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
              </tr>
            </thead>
            <tbody>
              {(legacyRows ?? []).map((r, i) => {
                const emp = r.employees as unknown as { name: string; staff_no: string } | null;
                return (
                  <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {new Date(r.changed_at).toLocaleString("en-KE")}
                    </td>
                    <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.field}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{r.old_value ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{r.new_value ?? "—"}</td>
                  </tr>
                );
              })}
              {(!legacyRows || legacyRows.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No changes recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Priority workflow runs</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Every run of the five hard-wired priority workflows (Onboarding, Leave Approval, Contract Renewal,
          Employee Data Change, Offboarding), most recent first.
        </p>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Workflow</th>
                <th className="px-4 py-2 font-medium">Entity</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Tasks</th>
                <th className="px-4 py-2 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {(workflowRuns ?? []).map((r) => {
                const def = r.workflow_definitions as unknown as { name: string } | null;
                const tasks = (r.workflow_tasks as unknown as { task: string; status: string }[]) ?? [];
                const done = tasks.filter((t) => t.status === "done").length;
                return (
                  <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-4 py-2 font-medium">{def?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 font-mono text-xs">{r.entity_type}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : r.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{tasks.length > 0 ? `${done}/${tasks.length} done` : "—"}</td>
                    <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{new Date(r.started_at).toLocaleString("en-KE")}</td>
                  </tr>
                );
              })}
              {(!workflowRuns || workflowRuns.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                    No workflow runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
