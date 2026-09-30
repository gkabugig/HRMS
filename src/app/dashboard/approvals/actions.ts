"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { decideProfileChangeApproval } from "@/lib/self-service/profile-change-actions";

// Single entry point the inbox calls, regardless of which module opened
// the request. Most request types only need the generic engine (record the
// decision, advance/close the request) — but a few need a follow-up effect
// applied only once the request is actually approved (e.g. writing the new
// field value), so those get dispatched to their own module-specific
// handler instead, which itself calls decideApprovalStep internally.
export async function decideApproval(stepId: string, decision: "approved" | "rejected" | "returned") {
  const supabase = await createClient();
  const { data: step } = await supabase
    .from("approval_steps")
    .select("approval_requests(request_type)")
    .eq("id", stepId)
    .maybeSingle();
  const requestType = (step?.approval_requests as unknown as { request_type: string } | null)?.request_type;

  if (requestType === "employee_data_change" && (decision === "approved" || decision === "rejected")) {
    await decideProfileChangeApproval(stepId, decision);
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  await decideApprovalStep(supabase, { stepId, actorUserId: user.id, orgId: appUser.org_id, decision });
  revalidatePath("/dashboard/approvals");
}
