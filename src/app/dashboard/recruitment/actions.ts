"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

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

export async function createRequisition(formData: FormData) {
  const supabase = await createClient();
  const appUser = await currentAppUser();

  const hiringManagerId =
    appUser?.role === "manager"
      ? appUser.employee_id
      : String(formData.get("hiring_manager_id") || "") || null;

  const { error } = await supabase.from("requisitions").insert({
    org_id: DEFAULT_ORG_ID,
    role: String(formData.get("role")),
    department: String(formData.get("department")),
    headcount: Number(formData.get("headcount") || 1),
    hiring_manager_id: hiringManagerId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/recruitment");
}

export async function closeRequisition(id: string) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase.from("requisitions").update({ status: "Closed" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/recruitment");
}

export async function addCandidate(requisitionId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("candidates").insert({
    requisition_id: requisitionId,
    name: String(formData.get("name")),
    source: String(formData.get("source") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/recruitment/${requisitionId}`);
}

export async function updateCandidateStage(formData: FormData) {
  const candidateId = String(formData.get("candidate_id"));
  const requisitionId = String(formData.get("requisition_id"));
  const stage = String(formData.get("stage"));

  const supabase = await createClient();
  const { error } = await supabase.from("candidates").update({ stage }).eq("id", candidateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/recruitment/${requisitionId}`);
}

export async function addOnboardingTask(candidateId: string, requisitionId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_tasks").insert({
    candidate_id: candidateId,
    task: String(formData.get("task")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/recruitment/${requisitionId}`);
}

export async function toggleOnboardingTask(
  taskId: string,
  requisitionId: string,
  done: boolean
) {
  "use server";
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/recruitment/${requisitionId}`);
}

export async function hireCandidate(
  candidateId: string,
  requisitionId: string,
  formData: FormData
) {
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("name")
    .eq("id", candidateId)
    .single();
  if (!candidate) throw new Error("Candidate not found");

  const { data: employee, error: empErr } = await supabase
    .from("employees")
    .insert({
      org_id: DEFAULT_ORG_ID,
      staff_no: String(formData.get("staff_no")),
      name: candidate.name,
      department: String(formData.get("department")),
      job_title: String(formData.get("job_title")),
      employment_type: String(formData.get("employment_type") || "Permanent"),
      date_of_hire: String(formData.get("date_of_hire")),
      basic: Number(formData.get("basic") || 0),
      house_allowance: Number(formData.get("house_allowance") || 0),
      transport_allowance: Number(formData.get("transport_allowance") || 0),
    })
    .select()
    .single();
  if (empErr) throw new Error(empErr.message);

  const { error: candErr } = await supabase
    .from("candidates")
    .update({ stage: "Hired", employee_id: employee.id })
    .eq("id", candidateId);
  if (candErr) throw new Error(candErr.message);

  revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  revalidatePath("/dashboard/employees");
  redirect(`/dashboard/recruitment/${requisitionId}`);
}
