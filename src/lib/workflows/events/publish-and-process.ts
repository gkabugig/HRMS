import type { SupabaseClient } from "@supabase/supabase-js";
import { publishEvent, type PublishEventInput } from "./publish-event";
import { startWorkflowFromEvent } from "../runtime/start-run";

// The synchronous happy path for a domain action whose own correctness
// depends on the triggered workflow actually having run before the action
// returns — submitProfileChangeRequest can't tell the user their request
// was submitted if no approval request exists yet for it to be decided
// against. This durably records the event first, then processes it
// immediately in the same request; /api/cron/workflow-events exists only
// to sweep up anything left 'pending' because the process died in between
// (a crash here, unlike a thrown business error, leaves no trace for the
// caller to react to — that's exactly the gap the cron job covers).
export async function publishAndProcessEvent(
  supabase: SupabaseClient,
  input: PublishEventInput
): Promise<{ eventId: string; runId: string | null }> {
  const eventId = await publishEvent(supabase, input);
  const { runId } = await startWorkflowFromEvent(supabase, eventId);
  return { eventId, runId };
}
