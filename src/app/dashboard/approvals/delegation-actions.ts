"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createDelegation, endDelegationNow } from "@/lib/approvals/delegation";

// "My Delegations" (Area 02 spec §12) — a user hands off their own pending
// approvals to a colleague for a time-bounded window (covering leave,
// travel, etc). Always acting as the delegator themselves — createDelegation
// already rejects self-delegation, and approval_delegations_self_manage RLS
// only lets a row's own delegator_user_id touch it, so there's no separate
// authorization check needed here beyond "is signed in."
export async function createMyDelegation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const delegateId = String(formData.get("delegate_id") || "");
  if (!delegateId) throw new Error("Choose who to delegate to.");
  const startsAt = String(formData.get("starts_at") || "");
  const endsAt = String(formData.get("ends_at") || "");
  if (!startsAt || !endsAt) throw new Error("Choose a start and end date.");
  const resource = String(formData.get("resource") || "") || null;
  const reason = String(formData.get("reason") || "") || null;

  await createDelegation(supabase, {
    orgId: appUser.org_id,
    delegatorId: user.id,
    delegateId,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    resource,
    reason,
  });

  revalidatePath("/dashboard/approvals");
}

export async function endMyDelegation(delegationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  await endDelegationNow(supabase, delegationId);
  revalidatePath("/dashboard/approvals");
}
