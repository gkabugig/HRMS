import type { SupabaseClient } from "@supabase/supabase-js";

// Controlled, server-side action registry (Area 03 spec §11: "a known,
// auditable set of registered actions — never eval()/Function()/arbitrary
// SQL driven off config"). A workflow_nodes row of type 'action' only ever
// names a key here via config_json.action_key; executeNode() looks it up
// in this map and nowhere else. Extending a seeded workflow with a new
// side effect means adding a handler here, reviewed like any other code
// change — not shipping a snippet of logic through the database.
export type ActionContext = {
  orgId: string;
  runId: string;
  context: Record<string, unknown>;
};

export type ActionResult = { output?: Record<string, unknown> };

export type ActionHandler = (supabase: SupabaseClient, ctx: ActionContext) => Promise<ActionResult>;

// The two actions Employee Data Change needs (spec scope: "Foundation +
// Employee Data Change" only — no other workflow is migrated onto the
// engine in this pass, so no other actions are registered yet). Both
// mirror exactly what decideProfileChangeApproval used to do inline before
// this rewire; the logic moved here, it didn't change.
const registry: Record<string, ActionHandler> = {
  apply_profile_change: async (supabase, ctx) => {
    const { employeeId, field, newValue, changeRequestId } = ctx.context as {
      employeeId: string;
      field: string;
      newValue: string;
      changeRequestId: string;
    };
    const { error: updateErr } = await supabase
      .from("employees")
      .update({ [field]: newValue })
      .eq("id", employeeId);
    if (updateErr) throw new Error(updateErr.message);

    const { error: statusErr } = await supabase
      .from("profile_change_requests")
      .update({ status: "Approved", decided_at: new Date().toISOString() })
      .eq("id", changeRequestId);
    if (statusErr) throw new Error(statusErr.message);

    return { output: { applied: true } };
  },

  reject_profile_change: async (supabase, ctx) => {
    const { changeRequestId } = ctx.context as { changeRequestId: string };
    const { error } = await supabase
      .from("profile_change_requests")
      .update({ status: "Rejected", decided_at: new Date().toISOString() })
      .eq("id", changeRequestId);
    if (error) throw new Error(error.message);

    return { output: { applied: false } };
  },
};

export class UnknownActionError extends Error {}

export function getAction(actionKey: string): ActionHandler {
  const handler = registry[actionKey];
  if (!handler) throw new UnknownActionError(`No registered workflow action "${actionKey}".`);
  return handler;
}
