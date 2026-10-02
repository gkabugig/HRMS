import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

const NODE_STATUS_STYLE: Record<string, string> = {
  completed: "bg-green-50 text-green-700 border-green-200",
  waiting: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
  skipped: "bg-neutral-50 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-700",
};

// Run-detail view (the other half of the chosen read-only scope, alongside
// the catalogue page) — every workflow_run_nodes row for this run, in the
// order they actually executed, with its status/output/error, plus the
// run's execution log. Not a graph editor: just what happened, step by
// step, the same spirit as the Approvals Centre's own decision-timeline
// page this mirrors.
export default async function WorkflowRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("workflow_runs")
    .select(
      "id, entity_type, entity_id, status, started_at, completed_at, context_json, workflow_definitions(name), workflow_versions(version)"
    )
    .eq("id", runId)
    .maybeSingle();
  if (!run) notFound();

  const { data: runNodes } = await supabase
    .from("workflow_run_nodes")
    .select("id, status, attempt, output_json, error, approval_request_id, due_at, started_at, completed_at, created_at, workflow_nodes(node_key, node_type, name)")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });

  const { data: logs } = await supabase
    .from("workflow_logs")
    .select("id, step, event, result, created_at")
    .eq("workflow_run_id", runId)
    .order("created_at", { ascending: true });

  const def = run.workflow_definitions as unknown as { name: string } | null;
  const version = run.workflow_versions as unknown as { version: number } | null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href="/dashboard/workflows" className="text-xs text-brand-600">
          ← Back to Workflows
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">
          {def?.name ?? "Workflow run"}
          {version ? <span className="text-neutral-400 dark:text-neutral-500 font-normal"> · v{version.version}</span> : null}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {run.entity_type.replace(/_/g, " ")} · started {new Date(run.started_at as string).toLocaleString("en-KE")}
          {run.completed_at ? ` · completed ${new Date(run.completed_at).toLocaleString("en-KE")}` : ""}
          {" · "}
          <span className="font-medium capitalize">{run.status}</span>
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Steps</h2>
        {(runNodes ?? []).map((rn) => {
          const node = rn.workflow_nodes as unknown as { node_key: string; node_type: string; name: string } | null;
          return (
            <div key={rn.id} className="flex items-start justify-between gap-3 text-sm border-b border-neutral-50 dark:border-neutral-900 last:border-0 pb-2 last:pb-0">
              <div>
                <p className="text-neutral-900 dark:text-neutral-50">
                  {node?.name ?? node?.node_key ?? "—"} <span className="text-neutral-400 dark:text-neutral-500">({node?.node_type})</span>
                  {rn.attempt > 1 ? <span className="text-neutral-400 dark:text-neutral-500"> · attempt {rn.attempt}</span> : null}
                </p>
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {rn.started_at ? `Started ${new Date(rn.started_at).toLocaleString("en-KE")}` : "Not started"}
                  {rn.completed_at ? ` · finished ${new Date(rn.completed_at).toLocaleString("en-KE")}` : ""}
                  {rn.approval_request_id ? (
                    <>
                      {" · "}
                      <Link href={`/dashboard/approvals/${rn.approval_request_id}`} className="text-brand-600">
                        view approval
                      </Link>
                    </>
                  ) : null}
                  {rn.error ? <span className="text-red-600"> · {rn.error}</span> : null}
                </p>
              </div>
              <span className={`text-xs font-medium capitalize border rounded px-2 py-0.5 shrink-0 ${NODE_STATUS_STYLE[rn.status] ?? ""}`}>
                {rn.status}
              </span>
            </div>
          );
        })}
        {(!runNodes || runNodes.length === 0) && <p className="text-sm text-neutral-400 dark:text-neutral-500">No steps recorded yet.</p>}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Execution log</h2>
        {(logs ?? []).length === 0 && <p className="text-sm text-neutral-400 dark:text-neutral-500">No log entries yet.</p>}
        <ol className="space-y-2">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="text-sm flex items-baseline gap-2">
              <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 w-36">{new Date(l.created_at as string).toLocaleString("en-KE")}</span>
              <span>
                <span className="font-medium text-neutral-900 dark:text-neutral-50">{l.step}</span>{" "}
                <span className="text-neutral-600 dark:text-neutral-300">{l.event}</span>
                {l.result ? <span className="text-neutral-400 dark:text-neutral-500"> ({l.result})</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
