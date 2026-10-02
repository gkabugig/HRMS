import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const STATUS_STYLE: Record<string, string> = {
  running: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

// Workflow Automation Engine (Area 03) — read-only catalogue + run history
// (the chosen scope explicitly excludes a visual graph editor: this page
// only shows what's configured and what's run, same spirit as the Audit
// Centre's workflow_runs panel, just focused and with a real run-detail
// drill-down instead of a flat log line).
export default async function WorkflowsPage() {
  const supabase = await createClient();

  const [{ data: definitions }, { data: runs }] = await Promise.all([
    supabase
      .from("workflow_definitions")
      .select(
        "id, key, name, description, active, current_version_id, workflow_versions:current_version_id(version, status, published_at)"
      )
      .order("name"),
    supabase
      .from("workflow_runs")
      .select("id, entity_type, entity_id, status, started_at, completed_at, workflow_definitions(name), workflow_version_id")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Workflows</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          The configured workflow catalogue and what&apos;s run against it. Only &quot;Employee Data Change&quot; runs on the
          versioned engine today — everything else still runs its original hard-coded flow and is tracked here the same way it
          always has been.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Catalogue</h2>
        {(definitions ?? []).map((d) => {
          const version = d.workflow_versions as unknown as { version: number; status: string; published_at: string | null } | null;
          return (
            <div key={d.id} className="flex items-center justify-between gap-3 text-sm border-b border-neutral-50 dark:border-neutral-900 last:border-0 pb-2 last:pb-0">
              <div>
                <p className="text-neutral-900 dark:text-neutral-50 font-medium">{d.name}</p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {d.key}
                  {version ? ` · v${version.version} (${version.status})` : " · running on the original hard-coded flow"}
                </p>
              </div>
              <span className={`text-xs font-medium ${d.active ? "text-green-700" : "text-neutral-400 dark:text-neutral-500"}`}>
                {d.active ? "Active" : "Inactive"}
              </span>
            </div>
          );
        })}
        {(!definitions || definitions.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">No workflows configured yet.</p>}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Recent runs</h2>
        {(runs ?? []).map((r) => {
          const def = r.workflow_definitions as unknown as { name: string } | null;
          return (
            <Link
              key={r.id}
              href={r.workflow_version_id ? `/dashboard/workflows/${r.id}` : "#"}
              className={`flex items-center justify-between gap-3 text-sm border-b border-neutral-50 dark:border-neutral-900 last:border-0 pb-2 last:pb-0 ${
                r.workflow_version_id ? "hover:bg-neutral-50 hover:dark:bg-neutral-900 -mx-1 px-1 rounded" : "cursor-default"
              }`}
            >
              <div>
                <p className="text-neutral-900 dark:text-neutral-50">
                  {def?.name ?? "—"} <span className="text-neutral-400 dark:text-neutral-500">· {r.entity_type.replace(/_/g, " ")}</span>
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  Started {new Date(r.started_at as string).toLocaleString("en-KE")}
                  {r.completed_at ? ` · completed ${new Date(r.completed_at).toLocaleString("en-KE")}` : ""}
                </p>
              </div>
              <span className={`text-xs font-medium capitalize border rounded px-2 py-0.5 ${STATUS_STYLE[r.status as string] ?? "bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700"}`}>
                {r.status}
              </span>
            </Link>
          );
        })}
        {(!runs || runs.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">No workflow runs yet.</p>}
      </div>
    </div>
  );
}
