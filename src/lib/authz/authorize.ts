// Universal RBAC — TypeScript entry point to the authorize_request() /
// *_granted_scopes() database layer (supabase/migrations/0035 + 0037).
//
// This is a thin wrapper, by design: the database is the source of truth
// for the authorization decision (spec §8, "the database must
// independently verify the request"), not this file. authorize() never
// trusts a caller-supplied user id for anything — it always derives the
// acting user from supabase.auth.getUser() against the current session,
// the same hardening already built into authorize_request() itself on the
// Postgres side (which ignores its own p_user_id argument for the actual
// decision). Passing it through here is only so the RPC call shape matches
// what the function signature expects; a mismatched/forged value changes
// nothing about the outcome.
//
// Consistent with this engagement's established pattern for "expected"
// failures (see settings/actions.ts, payroll/actions.ts): a denial is a
// normal, expected outcome, not a thrown exception, so callers get a
// plain boolean/result back instead of a try/catch — which also sidesteps
// Next.js's production redaction of Server Component error messages.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthorizeResult,
  RbacAction,
  RbacResource,
  RbacSensitivity,
} from "./types";

export type AuthorizeParams = {
  resource: RbacResource;
  action: RbacAction;
  sensitivity?: RbacSensitivity;
  /**
   * The specific row being acted on, when there is one (an employee id, a
   * document id, a payslip id). Omit for coarse "can this user reach this
   * feature at all" checks (e.g. showing/hiding a button). Record-level
   * resolvers only exist today for employees/documents/payroll
   * (authorize_request falls back to an organisation-scope-only check for
   * every other resource).
   */
  recordId?: string | null;
};

/**
 * Calls the database's authorize_request() RPC and returns its decision.
 * Fails closed: if the user can't be resolved from the session, or the RPC
 * itself errors, this returns `{ allowed: false }` rather than throwing —
 * callers should treat a thrown error from this function as a bug, not as
 * "permission denied".
 */
export async function authorize(
  supabase: SupabaseClient,
  params: AuthorizeParams
): Promise<AuthorizeResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { allowed: false, reason: "NO_ORGANISATION" };
  }

  const { data, error } = await supabase.rpc("authorize_request", {
    p_user_id: userData.user.id,
    p_resource: params.resource,
    p_action: params.action,
    p_sensitivity: params.sensitivity ?? "normal",
    p_record_id: params.recordId ?? null,
  });

  if (error || !data) {
    // Fail closed on any RPC-level failure (network, permission to call
    // the RPC itself, etc.) rather than letting an error surface as if it
    // were a legitimate allow.
    return { allowed: false, reason: "PERMISSION_DENIED" };
  }

  return data as AuthorizeResult;
}

/**
 * Convenience wrapper for Server Actions that follow the
 * `(prevState, formData) => Promise<{ error?: string }>` pattern used
 * throughout this app's forms. Returns a ready-to-display error string on
 * denial, or `null` when the action should proceed.
 */
export async function requireAuthorization(
  supabase: SupabaseClient,
  params: AuthorizeParams
): Promise<string | null> {
  const result = await authorize(supabase, params);
  if (!result.allowed) {
    return "You do not have permission to perform this action.";
  }
  return null;
}
