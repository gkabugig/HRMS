import type { SupabaseClient } from "@supabase/supabase-js";
import { startApproval } from "@/lib/approvals/start-approval";
import { getAction } from "../actions/registry";
import { runNotificationNode, type NotificationNodeConfig } from "./notify";
import { renderTemplate } from "./template";
import { evaluateCondition, type ConditionRule } from "./evaluate-condition";

type NodeRow = {
  id: string;
  node_key: string;
  node_type: string;
  name: string;
  config_json: Record<string, unknown>;
};

type RunRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  context_json: Record<string, unknown>;
};

type Transition = { to_node_id: string; branch: string | null; order_index: number };

async function loadRun(supabase: SupabaseClient, runId: string): Promise<RunRow> {
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("id, org_id, entity_type, entity_id, context_json")
    .eq("id", runId)
    .single();
  if (error || !data) throw new Error("Workflow run not found.");
  return data as unknown as RunRow;
}

async function loadNode(supabase: SupabaseClient, nodeId: string): Promise<NodeRow> {
  const { data, error } = await supabase
    .from("workflow_nodes")
    .select("id, node_key, node_type, name, config_json")
    .eq("id", nodeId)
    .single();
  if (error || !data) throw new Error("Workflow node not found.");
  return data as unknown as NodeRow;
}

// Exported so resume-from-approval.ts (which re-enters the graph at the
// node *after* the one that was waiting) can pick the same way, rather
// than duplicating the branch-matching rule.
export async function pickNextTransition(
  supabase: SupabaseClient,
  versionId: string,
  fromNodeId: string,
  branch: string | null
): Promise<Transition | null> {
  const { data: transitions, error } = await supabase
    .from("workflow_transitions")
    .select("to_node_id, branch, order_index")
    .eq("workflow_version_id", versionId)
    .eq("from_node_id", fromNodeId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  if (!transitions || transitions.length === 0) return null;
  if (transitions.length === 1 && transitions[0].branch === null) return transitions[0] as Transition;
  const match = transitions.find((t) => t.branch === branch);
  if (!match) {
    throw new Error(`No transition out of node ${fromNodeId} matches branch "${branch ?? "(none)"}".`);
  }
  return match as Transition;
}

async function log(supabase: SupabaseClient, runId: string, step: string, event: string, result: string) {
  await supabase.from("workflow_logs").insert({ workflow_run_id: runId, step, event, result });
}

// Sequential node-execution engine (Area 03 spec §10-§11, scoped to
// start/approval/action/notification/condition/end — task/parallel/wait
// are not used by any seeded workflow in this pass and throw rather than
// silently no-op if a future node config ever names one).
//
// Idempotency (spec §14): (workflow_run_id, node_id, attempt) is unique.
// Before doing any side-effecting work for a node, this checks for an
// already-'completed' row for that node on this run and, if found, skips
// straight to re-deriving which transition to take — so re-entering this
// function for a node that already ran (a retried cron sweep, a duplicate
// call) never re-executes its action or re-creates its approval request.
export async function executeNode(
  supabase: SupabaseClient,
  params: { runId: string; versionId: string; nodeId: string }
): Promise<void> {
  let currentNodeId: string | null = params.nodeId;

  while (currentNodeId) {
    const node = await loadNode(supabase, currentNodeId);

    const { data: existing } = await supabase
      .from("workflow_run_nodes")
      .select("id, status, output_json, attempt")
      .eq("workflow_run_id", params.runId)
      .eq("node_id", node.id)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "completed") {
      const branch = ((existing.output_json as Record<string, unknown> | null)?.branch as string | undefined) ?? null;
      const run = await loadRun(supabase, params.runId);
      const effectiveBranch = branch ?? (run.context_json.decision as string | undefined) ?? null;
      const next = await pickNextTransition(supabase, params.versionId, node.id, effectiveBranch);
      currentNodeId = next ? next.to_node_id : null;
      continue;
    }
    if (existing?.status === "waiting") {
      return; // still waiting on an external decision — nothing more to do right now
    }

    const run = await loadRun(supabase, params.runId);
    const attempt = existing ? existing.attempt + 1 : 1;
    const { data: runNodeRow, error: insertErr } = await supabase
      .from("workflow_run_nodes")
      .insert({
        org_id: run.org_id,
        workflow_run_id: params.runId,
        node_id: node.id,
        status: "active",
        attempt,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertErr || !runNodeRow) throw new Error(insertErr?.message ?? "Failed to create workflow run node.");

    let branch: string | null = null;
    let output: Record<string, unknown> = {};
    let waiting = false;

    try {
      switch (node.node_type) {
        case "start": {
          break;
        }

        case "notification": {
          await runNotificationNode(supabase, run.org_id, node.config_json as unknown as NotificationNodeConfig, run.context_json);
          break;
        }

        case "approval": {
          const config = node.config_json as { resource: string; summary_template: string };
          const summary = renderTemplate(config.summary_template, run.context_json);
          const { requestId, status } = await startApproval(supabase, {
            orgId: run.org_id,
            resource: config.resource,
            entityType: run.entity_type,
            entityId: run.entity_id,
            requesterId: run.context_json.requestedBy as string,
            subjectEmployeeId: (run.context_json.subjectEmployeeId as string | undefined) ?? null,
            summary,
            metadata: run.context_json,
          });
          if (status === "approved") {
            // Every step auto-passed or had no matching condition — nothing
            // for a human to decide, so the engine keeps walking right away.
            branch = "approved";
            output = { requestId, decision: "approved" };
            await supabase
              .from("workflow_runs")
              .update({
                context_json: {
                  ...run.context_json,
                  decision: "approved",
                  decisionLabel: "Approved",
                  approvalRequestId: requestId,
                },
              })
              .eq("id", params.runId);
          } else {
            waiting = true;
            output = { requestId };
            await supabase
              .from("workflow_run_nodes")
              .update({ status: "waiting", approval_request_id: requestId, output_json: output })
              .eq("id", runNodeRow.id);
            await supabase
              .from("workflow_runs")
              .update({
                current_node_id: node.id,
                context_json: { ...run.context_json, approvalRequestId: requestId },
              })
              .eq("id", params.runId);
            await log(supabase, params.runId, node.node_key, `Waiting on approval request ${requestId}`, "waiting");
          }
          break;
        }

        case "action": {
          const config = node.config_json as { action_key: string };
          const handler = getAction(config.action_key);
          const result = await handler(supabase, { orgId: run.org_id, runId: params.runId, context: run.context_json });
          output = result.output ?? {};
          break;
        }

        case "condition": {
          // Not exercised by the seeded Employee Data Change graph (it
          // branches directly off the approval node's own decision) but
          // implemented for real: evaluate the configured rule against the
          // run's context and branch on the boolean result.
          const matched = evaluateCondition(node.config_json as unknown as ConditionRule, run.context_json);
          branch = matched ? "true" : "false";
          output = { matched };
          break;
        }

        case "end": {
          const config = node.config_json as { outcome: "completed" | "failed" };
          await supabase
            .from("workflow_runs")
            .update({ status: config.outcome, completed_at: new Date().toISOString(), current_node_id: node.id })
            .eq("id", params.runId);
          break;
        }

        case "task":
        case "parallel":
        case "wait":
          throw new Error(
            `Node type "${node.node_type}" is not implemented — this engine covers start/approval/action/condition/notification/end only (Foundation + Employee Data Change scope).`
          );

        default:
          throw new Error(`Unknown node type "${node.node_type}".`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabase
        .from("workflow_run_nodes")
        .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
        .eq("id", runNodeRow.id);
      await supabase.from("workflow_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", params.runId);
      await log(supabase, params.runId, node.node_key, message, "failed");
      throw e;
    }

    if (waiting) return; // resumeWorkflowFromApproval() continues the walk later

    await supabase
      .from("workflow_run_nodes")
      .update({ status: "completed", output_json: { ...output, branch }, completed_at: new Date().toISOString() })
      .eq("id", runNodeRow.id);
    await log(supabase, params.runId, node.node_key, `${node.name} completed`, "completed");

    if (node.node_type === "end") return; // terminal node — run.status already set above

    const effectiveBranch = branch ?? (run.context_json.decision as string | undefined) ?? null;
    const next = await pickNextTransition(supabase, params.versionId, node.id, effectiveBranch);
    currentNodeId = next ? next.to_node_id : null;
  }
}
