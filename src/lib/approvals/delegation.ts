import type { SupabaseClient } from "@supabase/supabase-js";

// Universal Approval Engine — delegation checks (Area 02 spec §12). This
// mirrors the RLS policy added in supabase/migrations/0040 exactly (same
// three conditions: active window, resource match, same org) so the
// application-level error message can be specific about *why* a decision
// was rejected, instead of RLS's generic denial. RLS is still the real
// enforcement boundary — this is a pre-check for a clear error message.
export async function isValidDelegate(
  supabase: SupabaseClient,
  input: { delegatorId: string; delegateId: string; resource: string; orgId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from("approval_delegations")
    .select("id")
    .eq("delegator_user_id", input.delegatorId)
    .eq("delegate_user_id", input.delegateId)
    .eq("org_id", input.orgId)
    .lte("starts_at", new Date().toISOString())
    .gte("ends_at", new Date().toISOString())
    .or(`resource.is.null,resource.eq.${input.resource}`);
  return (data?.length ?? 0) > 0;
}

export async function createDelegation(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    delegatorId: string;
    delegateId: string;
    startsAt: string;
    endsAt: string;
    resource?: string | null;
    reason?: string | null;
  }
): Promise<string> {
  if (input.delegatorId === input.delegateId) {
    throw new Error("You can't delegate your approvals to yourself.");
  }
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new Error("The delegation end date must be after the start date.");
  }
  const { data, error } = await supabase
    .from("approval_delegations")
    .insert({
      org_id: input.orgId,
      delegator_user_id: input.delegatorId,
      delegate_user_id: input.delegateId,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      resource: input.resource ?? null,
      reason: input.reason ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// Ending a delegation early — the delegator's own RLS policy
// (approval_delegations_self_manage, "for all") already lets them update
// their own row, so setting ends_at to now is normally enough and leaves
// the row as a record of what happened. A delegation that hasn't started
// yet is deleted outright instead: the table has check (ends_at >
// starts_at), so setting ends_at to now (before a future starts_at) would
// violate it, and there's no history worth keeping for something that
// never actually took effect.
export async function endDelegationNow(supabase: SupabaseClient, delegationId: string): Promise<void> {
  const { data: delegation, error: fetchErr } = await supabase
    .from("approval_delegations")
    .select("starts_at")
    .eq("id", delegationId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  if (new Date(delegation.starts_at) > new Date()) {
    const { error } = await supabase.from("approval_delegations").delete().eq("id", delegationId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("approval_delegations")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", delegationId);
  if (error) throw new Error(error.message);
}
