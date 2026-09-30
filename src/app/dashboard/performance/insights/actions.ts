"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Feedback loop (spec §3: "authorised users can mark insights useful, not
// useful, false positive or resolved"). Dismissing/resolving is HR/admin
// only (ai_insights_hr_all is the only write policy on this table); a
// manager reading their team's insights can still leave feedback without
// resolving the record itself.
export async function decideInsight(formData: FormData) {
  const insightId = String(formData.get("insight_id"));
  const decision = String(formData.get("decision")) as "acknowledged" | "dismissed" | "resolved";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) throw new Error("Not authorised.");

  await supabase.from("ai_insights").update({ status: decision, resolved_by: user.id, resolved_at: new Date().toISOString() }).eq("id", insightId);

  await supabase.from("ai_feedback").insert({
    org_id: appUser.org_id,
    user_id: user.id,
    insight_id: insightId,
    feedback_type: decision === "dismissed" ? "not_useful" : decision === "resolved" ? "resolved" : "useful",
  });

  revalidatePath("/dashboard/performance/insights");
}

export async function leaveFeedback(formData: FormData) {
  const insightId = String(formData.get("insight_id"));
  const feedbackType = String(formData.get("feedback_type")) as "useful" | "not_useful";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("Not signed in.");

  await supabase.from("ai_feedback").insert({ org_id: appUser.org_id, user_id: user.id, insight_id: insightId, feedback_type: feedbackType });

  revalidatePath("/dashboard/performance/insights");
}
