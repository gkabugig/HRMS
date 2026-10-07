import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_POLICY, type RewardPolicyConfig } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any>;

export type RewardContext = {
  supabase: Db;
  userId: string;
  orgId: string;
  role: string;
  employeeId: string | null;
};

export async function getRewardContext(): Promise<RewardContext> {
  const supabase = (await createClient()) as Db;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("Your account is not set up yet.");
  return { supabase, userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string, employeeId: (appUser.employee_id as string | null) ?? null };
}

export async function requireRewardHr(): Promise<RewardContext> {
  const ctx = await getRewardContext();
  if (!["admin", "hr"].includes(ctx.role)) throw new Error("Only HR or an administrator can do this.");
  return ctx;
}

export async function requireRewardReviewer(): Promise<RewardContext> {
  const ctx = await getRewardContext();
  if (!["admin", "hr", "manager"].includes(ctx.role)) throw new Error("Only HR or a line manager can do this.");
  return ctx;
}

// Append-only trail (spec §15): who, when, old value, new value, reason.
export async function rewardAudit(
  db: Db,
  input: { orgId: string; actorUserId: string | null; event: string; recordType: string; recordId?: string | null; before?: unknown; after?: unknown; reason?: string | null }
) {
  await db.from("reward_audit_events").insert({
    org_id: input.orgId,
    actor_user_id: input.actorUserId,
    event: input.event,
    record_type: input.recordType,
    record_id: input.recordId ?? null,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    reason: input.reason ?? null,
  });
}

// A stored policy may pre-date a field added later: fill gaps from defaults.
export function mergePolicy(stored: Partial<RewardPolicyConfig> | null | undefined): RewardPolicyConfig {
  const s = stored ?? {};
  return {
    ...DEFAULT_POLICY,
    ...s,
    scoreWeights: { ...DEFAULT_POLICY.scoreWeights, ...(s.scoreWeights ?? {}) },
    rangeCutoffs: { ...DEFAULT_POLICY.rangeCutoffs, ...(s.rangeCutoffs ?? {}) },
    eligibility: { ...DEFAULT_POLICY.eligibility, ...(s.eligibility ?? {}) },
    bonus: { ...DEFAULT_POLICY.bonus, ...(s.bonus ?? {}) },
    merit: { ...DEFAULT_POLICY.merit, ...(s.merit ?? {}) },
    bands: s.bands ?? DEFAULT_POLICY.bands,
    meritMatrix: s.meritMatrix ?? DEFAULT_POLICY.meritMatrix,
  };
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
