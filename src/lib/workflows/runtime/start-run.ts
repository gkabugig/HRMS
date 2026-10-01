import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCondition, type ConditionRule } from "./evaluate-condition";
import { executeNode } from "./execute-node";

// Durable-event entry point (Area 03 spec §9/§19.D). Looks up the event,
// finds whichever org workflow is currently wired to react to it (an
// active definition's *published* current_version_id, with a trigger
// whose event_name matches and whose condition_json matches the event's
// payload), creates the run, and walks the graph from the start node.
//
// The event row's status always ends up processed/skipped/failed — never
// left 'pending' — so /api/cron/workflow-events (the durability safety
// net) never reprocesses something this call already handled, and calling
// this twice for the same event is a safe no-op (the second call sees
// status !== 'pending' and returns immediately).
export async function startWorkflowFromEvent(supabase: SupabaseClient, eventId: string): Promise<{ runId: string | null }> {
  const { data: event, error: eventErr } = await supabase
    .from("workflow_events")
    .select("id, org_id, event_name, entity_type, entity_id, payload_json, status")
    .eq("id", eventId)
    .single();
  if (eventErr || !event) throw new Error("Workflow event not found.");
  if (event.status !== "pending") return { runId: null };

  let match: { workflowId: string; versionId: string; startNodeId: string } | null = null;

  try {
    const { data: definitions } = await supabase
      .from("workflow_definitions")
      .select("id, current_version_id")
      .eq("org_id", event.org_id)
      .eq("active", true)
      .not("current_version_id", "is", null);

    for (const def of definitions ?? []) {
      const { data: version } = await supabase
        .from("workflow_versions")
        .select("id")
        .eq("id", def.current_version_id as string)
        .eq("status", "published")
        .maybeSingle();
      if (!version) continue;

      const { data: triggers } = await supabase
        .from("workflow_triggers")
        .select("condition_json")
        .eq("workflow_version_id", version.id)
        .eq("event_name", event.event_name);
      if (!triggers || triggers.length === 0) continue;

      const matched = triggers.some((t) =>
        evaluateCondition(t.condition_json as ConditionRule, event.payload_json as Record<string, unknown>)
      );
      if (!matched) continue;

      const { data: startNode } = await supabase
        .from("workflow_nodes")
        .select("id")
        .eq("workflow_version_id", version.id)
        .eq("node_type", "start")
        .maybeSingle();
      if (!startNode) throw new Error(`Workflow version ${version.id} has no start node.`);

      match = { workflowId: def.id as string, versionId: version.id as string, startNodeId: startNode.id as string };
      break; // first matching workflow wins — no two seeded workflows share a trigger in this scope
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("workflow_events").update({ status: "failed", error: message, processed_at: new Date().toISOString() }).eq("id", event.id);
    throw e;
  }

  if (!match) {
    // Nothing configured to react to this event — not an error, just quiet.
    await supabase.from("workflow_events").update({ status: "skipped", processed_at: new Date().toISOString() }).eq("id", event.id);
    return { runId: null };
  }

  const { data: run, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id: match.workflowId,
      workflow_version_id: match.versionId,
      org_id: event.org_id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      triggering_event_id: event.id,
      context_json: event.payload_json,
      current_node_id: match.startNodeId,
    })
    .select("id")
    .single();
  if (runErr || !run) {
    const message = runErr?.message ?? "Failed to create workflow run.";
    await supabase.from("workflow_events").update({ status: "failed", error: message, processed_at: new Date().toISOString() }).eq("id", event.id);
    throw new Error(message);
  }

  await supabase.from("workflow_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", event.id);
  await supabase.from("workflow_logs").insert({ workflow_run_id: run.id, step: "start", event: `Run started by event ${event.event_name}`, result: "started" });

  // The event is already durably marked 'processed' at this point — a run
  // exists. If executeNode() itself fails partway through, that failure is
  // the run's problem (workflow_runs.status='failed', a failed run_node
  // with the error), not the event's; this call propagates the error to
  // the caller (the synchronous happy-path caller decides what to do with
  // it) without re-touching the event row.
  await executeNode(supabase, { runId: run.id, versionId: match.versionId, nodeId: match.startNodeId });
  return { runId: run.id };
}
