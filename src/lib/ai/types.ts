// Area 12 (AI HR Assistant) shared types.
//
// A ToolHandler is deliberately NOT given a service-role client. It always
// runs on the caller's own session-scoped Supabase client (see
// src/lib/supabase/server.ts), so every query a tool makes is subject to
// RLS exactly as if the user had made it through the ordinary UI. This is
// what makes "no bypass of RLS/RBAC" (spec §9.6) an architectural property
// rather than a convention this file has to remember to uphold.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ToolCallContext = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  role: string;
  employeeId: string | null;
};

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type ToolHandler = (
  ctx: ToolCallContext,
  args: Record<string, unknown>
) => Promise<ToolResult>;

export const ACTION_TOOL_NAMES = [
  "start_workflow",
  "submit_position_request",
  "create_vacancy",
  "submit_compensation_change",
  "create_hr_service_request",
  "add_risk_comment",
  "assign_risk_action",
] as const;

export type ActionToolName = (typeof ACTION_TOOL_NAMES)[number];

export function isActionTool(name: string): name is ActionToolName {
  return (ACTION_TOOL_NAMES as readonly string[]).includes(name);
}
