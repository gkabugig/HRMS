import type { SupabaseClient } from "@supabase/supabase-js";
import { executeNode, pickNextTransition } from "./execute-node";

// The generic approval-node resume hook. decideApprovalStep() (Area 02)
// stays completely unaware that workflows exist — this is called
// separately, by whichever domain action just finished deciding the step
// (decideProfileChangeApproval), after the decision is already recorded.
//
// It looks for a workflow_run_nodes row still 'waiting' on this specific
// approval_request_id (there can be at most one — see the partial unique
// index in migration 0047) and, if one exists, stamps the decision into
// the run and keeps walking the graph from there. If the decided request
// isn't driven by any workflow run — most approval_definitions have no
// workflow behind them at all — this is a silent no-op, not an error.
export async function resumeWorkflowFromApproval(
  supabase: SupabaseClient,
  approvalRequestId: string,
  decision: "approved" | "rejected" | "returned"
): Promise<void> {
  const { data: waitingNode } = await supabase
    .from("workflow_run_nodes")
    .select("id, workflow_run_id, node_id")
    .eq("approval_request_id", approvalRequestId)
    .eq("status", "waiting")
    .maybeSingle();
  if (!waitingNode) return;

  const { data: run } = await supabase
    .from("workflow_runs")
    .select("id, workflow_version_id, context_json")
    .eq("id", waitingNode.workflow_run_id)
    .single();
  if (!run || !run.workflow_version_id) return;

  // "returned" has no branch of its own in the seeded Employee Data Change
  // graph (no step in that flow ever returns a request) — fold it into
  // "rejected" so the run still terminates cleanly instead of hanging if
  // this is ever reached by a future workflow that does use "returned".
  const branch = decision === "approved" ? "approved" : "rejected";

  await supabase
    .from("workflow_run_nodes")
    .update({
      status: "completed",
      output_json: { decision: branch, branch },
      completed_at: new Date().toISOString(),
    })
    .eq("id", waitingNode.id);

  const decisionLabel = branch === "approved" ? "Approved" : "Rejected";
  const nextContext = { ...(run.context_json as Record<string, unknown>), decision: branch, decisionLabel };
  await supabase.from("workflow_runs").update({ context_json: nextContext }).eq("id", run.id);
  await supabase
    .from("workflow_logs")
    .insert({ workflow_run_id: run.id, step: "approval_resumed", event: `Resumed after approval decision: ${branch}`, result: branch });

  const next = await pickNextTransition(supabase, run.workflow_version_id, waitingNode.node_id, branch);
  if (!next) return; // graph ends at the approval node on this branch — nothing further to run

  await executeNode(supabase, { runId: run.id, versionId: run.workflow_version_id, nodeId: next.to_node_id });
}
