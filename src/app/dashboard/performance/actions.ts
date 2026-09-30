"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function currentAppUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();
  return data;
}

export async function createAppraisal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("appraisals").insert({
    employee_id: String(formData.get("employee_id")),
    cycle: String(formData.get("cycle")),
    created_by: user!.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/performance");
}

export async function addGoal(appraisalId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("appraisal_goals").insert({
    appraisal_id: appraisalId,
    goal_text: String(formData.get("goal_text")),
    weight: Number(formData.get("weight")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/performance/${appraisalId}`);
}

export async function setSelfRating(goalId: string, appraisalId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appraisal_goals")
    .update({ self_rating: Number(formData.get("self_rating")) })
    .eq("id", goalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/performance/${appraisalId}`);
}

export async function setManagerRating(goalId: string, appraisalId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appraisal_goals")
    .update({ manager_rating: Number(formData.get("manager_rating")) })
    .eq("id", goalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/performance/${appraisalId}`);
}

export async function updateSelfComments(appraisalId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ self_comments: String(formData.get("self_comments") || "") })
    .eq("id", appraisalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/performance/${appraisalId}`);
}

export async function updateManagerComments(appraisalId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("appraisals")
    .update({ manager_comments: String(formData.get("manager_comments") || "") })
    .eq("id", appraisalId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/performance/${appraisalId}`);
}

export async function finalizeAppraisal(appraisalId: string) {
  "use server";
  const supabase = await createClient();

  const { data: goals } = await supabase
    .from("appraisal_goals")
    .select("weight, manager_rating")
    .eq("appraisal_id", appraisalId);

  const totalWeight = (goals ?? []).reduce((sum, g) => sum + g.weight, 0) || 1;
  const weightedScore = (goals ?? []).reduce(
    (sum, g) => sum + (g.manager_rating ?? 0) * g.weight,
    0
  );
  const finalScore = weightedScore / totalWeight; // out of 5

  const { error } = await supabase
    .from("appraisals")
    .update({
      status: "Completed",
      final_score: Math.round(finalScore * 100) / 100,
      completed_at: new Date().toISOString(),
    })
    .eq("id", appraisalId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/performance/${appraisalId}`);
  revalidatePath("/dashboard/performance");
}
