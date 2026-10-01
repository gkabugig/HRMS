// Area 12 §9.9 confirmation matrix: the user's explicit confirm/reject
// decision on a staged ai_action_requests row is the ONLY thing that can
// turn a proposed action into a real effect. This file is the only caller
// of tool-handlers.ts's executeActionTool.
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { executeActionTool } from "./tool-handlers";
import type { ToolCallContext } from "./types";

// ai_action_events (spec §9.3) is the AI-specific event trail, parallel to
// Area 11's workforce_risk_events — distinct from, and in addition to, the
// org-wide audit_events log recordAuditEvent writes to.
async function logActionEvent(
  supabase: SupabaseClient,
  input: { orgId: string; actionRequestId: string; eventType: string; actorUserId: string; detail?: Record<string, unknown> }
) {
  await supabase.from("ai_action_events").insert({
    org_id: input.orgId,
    action_request_id: input.actionRequestId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    detail: input.detail ?? {},
  });
}

export async function confirmActionRequest(supabase: SupabaseClient, actionRequestId: string, decision: "confirmed" | "rejected") {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: request, error } = await supabase.from("ai_action_requests").select("id, org_id, tool_name, arguments, status, requested_by").eq("id", actionRequestId).maybeSingle();
  if (error || !request) throw new Error("Action request not found, or not visible to you.");
  if (request.status !== "pending") throw new Error(`This action is already ${request.status}.`);
  // Only the original requester (or HR/admin, for oversight) may confirm.
  if (request.requested_by !== user.id && !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only the person who asked for this action can confirm it.");
  }

  if (decision === "rejected") {
    await supabase.from("ai_action_requests").update({ status: "rejected" }).eq("id", actionRequestId);
    await logActionEvent(supabase, { orgId: request.org_id, actionRequestId, eventType: "rejected", actorUserId: user.id });
    await recordAuditEvent(supabase, {
      orgId: request.org_id,
      actorUserId: user.id,
      action: `ai_action_requests.${request.tool_name}.rejected`,
      resourceType: "ai_action_request",
      resourceId: actionRequestId,
      eventCategory: "security",
    });
    return { status: "rejected" as const };
  }

  await supabase.from("ai_action_requests").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", actionRequestId);
  await logActionEvent(supabase, { orgId: request.org_id, actionRequestId, eventType: "confirmed", actorUserId: user.id });

  const ctx: ToolCallContext = {
    supabase,
    orgId: appUser.org_id as string,
    userId: user.id,
    role: appUser.role as string,
    employeeId: (appUser.employee_id as string | null) ?? null,
  };

  const result = await executeActionTool(ctx, request.tool_name, (request.arguments as Record<string, unknown>) ?? {});

  await supabase
    .from("ai_action_requests")
    .update({
      status: result.ok ? "executed" : "rejected",
      executed_at: result.ok ? new Date().toISOString() : null,
      result: result.ok ? (result.data as Record<string, unknown>) : null,
      error: result.ok ? null : result.error,
    })
    .eq("id", actionRequestId);

  await logActionEvent(supabase, {
    orgId: request.org_id,
    actionRequestId,
    eventType: result.ok ? "executed" : "failed",
    actorUserId: user.id,
    detail: result.ok ? undefined : { error: result.error },
  });

  await recordAuditEvent(supabase, {
    orgId: request.org_id,
    actorUserId: user.id,
    action: `ai_action_requests.${request.tool_name}.${result.ok ? "executed" : "failed"}`,
    resourceType: "ai_action_request",
    resourceId: actionRequestId,
    eventCategory: "workflow",
    riskLevel: request.tool_name === "submit_compensation_change" ? "elevated" : "normal",
    metadata: result.ok ? undefined : { error: result.error },
  });

  return result.ok ? { status: "executed" as const, data: result.data } : { status: "failed" as const, error: result.error };
}
