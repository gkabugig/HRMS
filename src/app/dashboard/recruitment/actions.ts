"use server";

import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultProbationEndDate } from "@/lib/compliance";


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

export async function createRequisition(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const appUser = await currentAppUser();

    const hiringManagerId =
      appUser?.role === "manager"
        ? appUser.employee_id
        : String(formData.get("hiring_manager_id") || "") || null;

    const { error } = await supabase.from("requisitions").insert({
      org_id: await requireOrgId(supabase),
      role: String(formData.get("role")),
      department: String(formData.get("department")),
      headcount: Number(formData.get("headcount") || 1),
      hiring_manager_id: hiringManagerId,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/dashboard/recruitment");
  });
}

export async function closeRequisition(id: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("requisitions").update({ status: "Closed" }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/recruitment");
  });
}

export async function addCandidate(requisitionId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("candidates").insert({
      requisition_id: requisitionId,
      name: String(formData.get("name")),
      source: String(formData.get("source") || "") || null,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  });
}

// Seeded once a candidate is offered the role, so the paper trail for the
// 2022 amendment (clearance certificates may only be requested after an
// offer, never before) exists from the start.
const DEFAULT_OFFER_TASKS = [
  "Issue written offer letter",
  "Request certificate of good conduct (only now that an offer has been made)",
  "Request KRA/NSSF/SHIF clearance certificates (post-offer only)",
  "Collect signed written contract / particulars of employment",
];

export async function updateCandidateStage(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const candidateId = String(formData.get("candidate_id"));
    const requisitionId = String(formData.get("requisition_id"));
    const stage = String(formData.get("stage"));

    const supabase = await createClient();
    const { error } = await supabase.from("candidates").update({ stage }).eq("id", candidateId);
    if (error) throw new Error(error.message);

    if (stage === "Offered") {
      const { data: existing } = await supabase
        .from("onboarding_tasks")
        .select("id")
        .eq("candidate_id", candidateId)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase
          .from("onboarding_tasks")
          .insert(DEFAULT_OFFER_TASKS.map((task) => ({ candidate_id: candidateId, task })));
      }
    }

    revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  });
}

export async function addOnboardingTask(candidateId: string, requisitionId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("onboarding_tasks").insert({
      candidate_id: candidateId,
      task: String(formData.get("task")),
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  });
}

export async function toggleOnboardingTask(taskId: string, requisitionId: string, done: boolean, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("onboarding_tasks")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  });
}

// Hiring only needs a single click: the candidate's name carries straight
// over into a new employee record (department/job title come from the
// requisition, since those are already known), and everything else — staff
// no, compensation, statutory numbers, branch, reporting line, contract —
// gets filled in afterwards on the Employees page, where HR lands right
// after this runs.
export async function hireCandidate(candidateId: string, requisitionId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const supabase = await createClient();

    const { data: candidate } = await supabase
      .from("candidates")
      .select("name")
      .eq("id", candidateId)
      .single();
    if (!candidate) throw new Error("Candidate not found");

    const { data: requisition } = await supabase
      .from("requisitions")
      .select("role, department")
      .eq("id", requisitionId)
      .single();
    if (!requisition) throw new Error("Requisition not found");

    const dateOfHire = new Date().toISOString().slice(0, 10);
    // Placeholder, unique per org — HR corrects this to the real staff number
    // from the Employees page as part of filling in the rest of the record.
    const placeholderStaffNo = `PENDING-${candidateId.slice(0, 8)}`;

    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .insert({
        org_id: await requireOrgId(supabase),
        staff_no: placeholderStaffNo,
        name: candidate.name,
        department: requisition.department,
        job_title: requisition.role,
        date_of_hire: dateOfHire,
        // Employment Act s.42: 6-month initial probation, editable later from
        // the Employees page.
        probation_end_date: defaultProbationEndDate(dateOfHire),
      })
      .select()
      .single();
    if (empErr) throw new Error(empErr.message);

    await supabase.from("employee_job_history").insert({
      employee_id: employee.id,
      effective_from: dateOfHire,
      department: requisition.department,
      job_title: requisition.role,
      employment_type: "Permanent",
      reason: "Hired",
    });

    const { error: candErr } = await supabase
      .from("candidates")
      .update({ stage: "Hired", employee_id: employee.id })
      .eq("id", candidateId);
    if (candErr) throw new Error(candErr.message);

    revalidatePath(`/dashboard/recruitment/${requisitionId}`);
    revalidatePath("/dashboard/employees");
    redirect("/dashboard/employees");
  });
}
