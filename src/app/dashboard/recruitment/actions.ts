"use server";

import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defaultProbationEndDate } from "@/lib/compliance";
import { createNotification, createNotificationForMany } from "@/lib/notifications/create-notification";
import { canMoveTo, checkRejectionReason } from "@/lib/recruitment/stages";
import { RECOMMENDATIONS, validScore } from "@/lib/recruitment/scorecard";
import { validateCv, storeCv } from "@/lib/recruitment/cv";

// Who is calling, derived from the session (never from the form).
async function ctx() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You are not signed in.");
  const { data: appUser } = await supabase
    .from("app_users")
    .select("org_id, role, employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) throw new Error("Your account is not set up.");
  const isHr = appUser.role === "admin" || appUser.role === "hr";
  return { supabase, user, appUser, isHr };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

function needHr(c: Ctx) {
  if (!c.isHr) throw new Error("Only HR or an administrator can do this.");
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const textOrNull = (fd: FormData, key: string) => text(fd, key) || null;

function refresh(requisitionId?: string, candidateId?: string) {
  revalidatePath("/dashboard/recruitment");
  if (requisitionId) revalidatePath(`/dashboard/recruitment/${requisitionId}`);
  if (requisitionId && candidateId) revalidatePath(`/dashboard/recruitment/${requisitionId}/${candidateId}`);
}

async function hrUserIds(supabase: Ctx["supabase"], orgId: string): Promise<string[]> {
  const { data } = await supabase.from("app_users").select("id").eq("org_id", orgId).in("role", ["admin", "hr"]);
  return (data ?? []).map((u) => u.id as string);
}

// ---------------------------------------------------------------- requisitions

// HR/admin raise approved requisitions straight away. A manager's request is
// held as "Pending" until HR/admin approve it (managers have no write access
// to the table, so the row is created here after the checks).
export async function createRequisition(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    const isManager = c.appUser.role === "manager";
    if (!c.isHr && !isManager) throw new Error("You can't raise a requisition.");

    const role = text(formData, "role");
    const department = text(formData, "department");
    if (!role || !department) throw new Error("Enter the job title and the department.");
    const headcount = Math.max(1, Math.floor(Number(formData.get("headcount") || 1)) || 1);
    const closing = textOrNull(formData, "closing_date");

    const row = {
      org_id: c.appUser.org_id,
      role,
      department,
      headcount,
      hiring_manager_id: isManager ? c.appUser.employee_id : textOrNull(formData, "hiring_manager_id"),
      description: textOrNull(formData, "description"),
      requirements: textOrNull(formData, "requirements"),
      location: textOrNull(formData, "location"),
      employment_type: text(formData, "employment_type") || "Permanent",
      closing_date: closing,
      requested_by: c.user.id,
      approval_status: c.isHr ? "Approved" : "Pending",
      approved_by: c.isHr ? c.user.id : null,
      approved_at: c.isHr ? new Date().toISOString() : null,
    };

    const writer = c.isHr ? c.supabase : createAdminClient();
    const { data: created, error } = await writer.from("requisitions").insert(row).select("id").single();
    if (error) throw new Error(error.message);

    if (!c.isHr) {
      const recipients = await hrUserIds(c.supabase, c.appUser.org_id);
      await createNotificationForMany(c.supabase, recipients, {
        orgId: c.appUser.org_id,
        type: "REQUISITION_APPROVAL_REQUIRED",
        category: "recruitment",
        priority: "action_required",
        title: "Hiring request needs approval",
        message: `A manager asked to hire ${headcount} × ${role} (${department}).`,
        entityType: "requisition",
        entityId: created.id,
        actionUrl: "/dashboard/recruitment",
      });
    }
    refresh();
  });
}

export async function decideRequisition(
  id: string,
  decision: "Approved" | "Rejected",
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const note = textOrNull(formData, "note");
    if (decision === "Rejected" && !note) throw new Error("Add a short reason so the manager knows why.");

    const { data: req, error } = await c.supabase
      .from("requisitions")
      .update({ approval_status: decision, approved_by: c.user.id, approved_at: new Date().toISOString(), approval_note: note })
      .eq("id", id)
      .select("id, role, requested_by")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Requisition not found.");

    if (req.requested_by && req.requested_by !== c.user.id) {
      await createNotification(c.supabase, {
        orgId: c.appUser.org_id,
        recipientUserId: req.requested_by,
        type: `REQUISITION_${decision.toUpperCase()}`,
        category: "recruitment",
        priority: "information",
        title: `Hiring request ${decision.toLowerCase()}`,
        message: `Your request to hire a ${req.role} was ${decision.toLowerCase()}${note ? `: ${note}` : "."}`,
        entityType: "requisition",
        entityId: req.id,
        actionUrl: "/dashboard/recruitment",
      });
    }
    refresh(id);
  });
}

export async function updateRequisitionAd(id: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const { error } = await c.supabase
      .from("requisitions")
      .update({
        description: textOrNull(formData, "description"),
        requirements: textOrNull(formData, "requirements"),
        location: textOrNull(formData, "location"),
        employment_type: text(formData, "employment_type") || "Permanent",
        closing_date: textOrNull(formData, "closing_date"),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    refresh(id);
  });
}

// Publishing puts the job on the public careers page.
export async function setRequisitionPublished(
  id: string,
  publish: boolean,
  _prev: FormResult,
  _formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const { data: req } = await c.supabase
      .from("requisitions")
      .select("status, approval_status, description")
      .eq("id", id)
      .maybeSingle();
    if (!req) throw new Error("Requisition not found.");
    if (publish) {
      if (req.approval_status !== "Approved") throw new Error("Approve the requisition before publishing it.");
      if (req.status !== "Open") throw new Error("A closed requisition can't be published.");
      if (!req.description) throw new Error("Add a job description first, so applicants know what the job is.");
    }
    const { error } = await c.supabase.from("requisitions").update({ published: publish }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh(id);
  });
}

export async function closeRequisition(id: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const { error } = await c.supabase.from("requisitions").update({ status: "Closed", published: false }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh(id);
  });
}

// ------------------------------------------------------------------ candidates

function duplicateMessage(code?: string): string | null {
  return code === "23505" ? "A candidate with this email has already applied for this job." : null;
}

export async function addCandidate(requisitionId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const name = text(formData, "name");
    if (!name) throw new Error("Enter the candidate's name.");
    const cv = formData.get("cv");
    const cvFile = cv instanceof File && cv.size > 0 ? cv : null;
    const cvError = validateCv(cvFile);
    if (cvError) throw new Error(cvError);

    const { data: created, error } = await c.supabase
      .from("candidates")
      .insert({
        requisition_id: requisitionId,
        name,
        source: textOrNull(formData, "source"),
        email: textOrNull(formData, "email")?.toLowerCase() ?? null,
        phone: textOrNull(formData, "phone"),
        notes: textOrNull(formData, "notes"),
      })
      .select("id")
      .single();
    if (error) throw new Error(duplicateMessage(error.code) ?? error.message);

    if (cvFile) {
      const path = await storeCv(createAdminClient(), requisitionId, created.id, cvFile);
      await c.supabase.from("candidates").update({ cv_path: path }).eq("id", created.id);
    }
    refresh(requisitionId);
  });
}

export async function updateCandidateDetails(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const name = text(formData, "name");
    if (!name) throw new Error("The candidate's name can't be empty.");
    const cv = formData.get("cv");
    const cvFile = cv instanceof File && cv.size > 0 ? cv : null;
    const cvError = validateCv(cvFile);
    if (cvError) throw new Error(cvError);

    const patch: Record<string, unknown> = {
      name,
      source: textOrNull(formData, "source"),
      email: textOrNull(formData, "email")?.toLowerCase() ?? null,
      phone: textOrNull(formData, "phone"),
      notes: textOrNull(formData, "notes"),
    };
    if (cvFile) patch.cv_path = await storeCv(createAdminClient(), requisitionId, candidateId, cvFile);

    const { data, error } = await c.supabase.from("candidates").update(patch).eq("id", candidateId).select("id");
    if (error) throw new Error(duplicateMessage(error.code) ?? error.message);
    if (!data?.length) throw new Error("Candidate not found.");
    refresh(requisitionId, candidateId);
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

async function moveStage(c: Ctx, candidateId: string, stage: string, reason: string | null) {
  const { data: current } = await c.supabase.from("candidates").select("stage").eq("id", candidateId).maybeSingle();
  if (!current) throw new Error("Candidate not found.");
  const blocked = canMoveTo(current.stage, stage);
  if (blocked) throw new Error(blocked);
  if (stage === "Rejected") {
    const bad = checkRejectionReason(reason);
    if (bad) throw new Error(bad);
  }

  const { error } = await c.supabase
    .from("candidates")
    .update({ stage, rejection_reason: stage === "Rejected" ? reason : null })
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  if (stage === "Offered") {
    const { data: existing } = await c.supabase.from("onboarding_tasks").select("id").eq("candidate_id", candidateId).limit(1);
    if (!existing || existing.length === 0) {
      await c.supabase.from("onboarding_tasks").insert(DEFAULT_OFFER_TASKS.map((task) => ({ candidate_id: candidateId, task })));
    }
  }
}

// Used by the pipeline cards, the profile page and the reject form.
export async function updateCandidateStage(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const candidateId = text(formData, "candidate_id");
    const requisitionId = text(formData, "requisition_id");
    const stage = text(formData, "stage");
    const picked = text(formData, "rejection_reason");
    const reason = picked === "Other" ? text(formData, "rejection_reason_other") || null : picked || null;
    await moveStage(c, candidateId, stage, reason);
    refresh(requisitionId, candidateId);
  });
}

export async function addOnboardingTask(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const task = text(formData, "task");
    if (!task) throw new Error("Describe the task.");
    const { error } = await c.supabase.from("onboarding_tasks").insert({ candidate_id: candidateId, task });
    if (error) throw new Error(error.message);
    refresh(requisitionId, candidateId);
  });
}

export async function toggleOnboardingTask(
  taskId: string,
  requisitionId: string,
  done: boolean,
  _prev: FormResult,
  _formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const { error } = await c.supabase
      .from("onboarding_tasks")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
    refresh(requisitionId);
  });
}

// ------------------------------------------------------------------ interviews

export async function scheduleInterview(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const when = text(formData, "scheduled_at");
    if (!when) throw new Error("Choose the interview date and time.");
    // The form sends local Kenya time (UTC+3) without an offset.
    const scheduledAt = new Date(`${when}:00+03:00`);
    if (Number.isNaN(scheduledAt.getTime())) throw new Error("That date and time isn't valid.");
    const panel = formData.getAll("panel").map(String).filter(Boolean);

    const { data: created, error } = await c.supabase
      .from("candidate_interviews")
      .insert({
        candidate_id: candidateId,
        scheduled_at: scheduledAt.toISOString(),
        mode: text(formData, "mode") || "In person",
        location: textOrNull(formData, "location"),
        notes: textOrNull(formData, "notes"),
        panel_user_ids: panel,
        created_by: c.user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: cand } = await c.supabase.from("candidates").select("name").eq("id", candidateId).maybeSingle();
    await createNotificationForMany(
      c.supabase,
      panel.filter((p) => p !== c.user.id),
      {
        orgId: c.appUser.org_id,
        type: "INTERVIEW_SCHEDULED",
        category: "recruitment",
        priority: "information",
        title: "You're on an interview panel",
        message: `Interview with ${cand?.name ?? "a candidate"} on ${when.replace("T", " ")}.`,
        entityType: "candidate_interview",
        entityId: created.id,
        actionUrl: `/dashboard/recruitment/${requisitionId}/${candidateId}`,
      }
    );
    refresh(requisitionId, candidateId);
  });
}

export async function setInterviewStatus(
  interviewId: string,
  status: "Completed" | "Cancelled",
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  _formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const { error } = await c.supabase.from("candidate_interviews").update({ status }).eq("id", interviewId);
    if (error) throw new Error(error.message);
    refresh(requisitionId, candidateId);
  });
}

// One scorecard per interviewer per candidate; submitting again updates it.
export async function submitScorecard(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    if (!c.isHr && c.appUser.role !== "manager") throw new Error("You can't score candidates.");
    const scores = {
      skills: Number(formData.get("skills")),
      experience: Number(formData.get("experience")),
      communication: Number(formData.get("communication")),
      culture_fit: Number(formData.get("culture_fit")),
    };
    if (!Object.values(scores).every(validScore)) throw new Error("Give each area a score from 1 to 5.");
    const recommendation = text(formData, "recommendation");
    if (!(RECOMMENDATIONS as string[]).includes(recommendation)) throw new Error("Choose your overall recommendation.");

    const { error } = await c.supabase.from("interview_scorecards").upsert(
      {
        candidate_id: candidateId,
        interviewer_id: c.user.id,
        ...scores,
        recommendation,
        notes: textOrNull(formData, "notes"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id,interviewer_id" }
    );
    if (error) {
      throw new Error(
        error.code === "42501" ? "You can only score candidates for jobs where you are the hiring manager." : error.message
      );
    }
    refresh(requisitionId, candidateId);
  });
}

// ---------------------------------------------------------------------- offers

export async function saveOffer(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const salaryRaw = text(formData, "salary");
    const salary = salaryRaw ? Number(salaryRaw) : null;
    if (salary !== null && (!Number.isFinite(salary) || salary < 0)) throw new Error("Enter the salary as a number.");
    const fields = { salary, start_date: textOrNull(formData, "start_date"), terms: textOrNull(formData, "terms") };

    const { data: latest } = await c.supabase
      .from("candidate_offers")
      .select("id, status")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest && (latest.status === "Draft" || latest.status === "Sent")) {
      const { error } = await c.supabase.from("candidate_offers").update(fields).eq("id", latest.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await c.supabase.from("candidate_offers").insert({ candidate_id: candidateId, ...fields, created_by: c.user.id });
      if (error) throw new Error(error.message);
    }
    refresh(requisitionId, candidateId);
  });
}

export async function setOfferStatus(
  offerId: string,
  status: "Sent" | "Accepted" | "Declined" | "Withdrawn",
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  _formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);
    const today = new Date().toISOString().slice(0, 10);
    const patch: Record<string, unknown> = { status };
    if (status === "Sent") patch.sent_on = today;
    else patch.responded_on = today;
    const { error } = await c.supabase.from("candidate_offers").update(patch).eq("id", offerId);
    if (error) throw new Error(error.message);

    const { data: cand } = await c.supabase.from("candidates").select("stage").eq("id", candidateId).maybeSingle();
    if (cand && cand.stage !== "Hired") {
      if (status === "Sent" && cand.stage !== "Offered") await moveStage(c, candidateId, "Offered", null);
      if (status === "Declined" && cand.stage !== "Rejected") await moveStage(c, candidateId, "Rejected", "Declined the offer");
    }
    refresh(requisitionId, candidateId);
  });
}

// ------------------------------------------------------------------------ hire

// Hiring needs a single click: the candidate's details carry straight over
// into a new employee record (department/job title come from the
// requisition, start date from the accepted offer), and everything else —
// staff no, compensation, statutory numbers, branch, reporting line,
// contract — gets filled in afterwards on the Employees page.
export async function hireCandidate(
  candidateId: string,
  requisitionId: string,
  _prev: FormResult,
  _formData: FormData
): Promise<FormResult> {
  return toResult(async () => {
    const c = await ctx();
    needHr(c);

    const { data: candidate } = await c.supabase
      .from("candidates")
      .select("name, email, phone, stage, employee_id")
      .eq("id", candidateId)
      .single();
    if (!candidate) throw new Error("Candidate not found");
    if (candidate.employee_id) throw new Error("This candidate has already been hired.");
    if (candidate.stage !== "Offered") throw new Error("Move the candidate to Offered before hiring.");

    const { data: requisition } = await c.supabase.from("requisitions").select("role, department").eq("id", requisitionId).single();
    if (!requisition) throw new Error("Requisition not found");

    const { data: offer } = await c.supabase
      .from("candidate_offers")
      .select("status, start_date")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (offer && offer.status !== "Accepted") throw new Error("Mark the offer as Accepted before hiring.");

    const dateOfHire = offer?.start_date ?? new Date().toISOString().slice(0, 10);
    // Placeholder, unique per org — HR corrects this to the real staff number
    // from the Employees page as part of filling in the rest of the record.
    const placeholderStaffNo = `PENDING-${candidateId.slice(0, 8)}`;

    const { data: employee, error: empErr } = await c.supabase
      .from("employees")
      .insert({
        org_id: c.appUser.org_id,
        staff_no: placeholderStaffNo,
        name: candidate.name,
        department: requisition.department,
        job_title: requisition.role,
        date_of_hire: dateOfHire,
        personal_email: candidate.email,
        phone_number: candidate.phone,
        // Employment Act s.42: 6-month initial probation, editable later from
        // the Employees page.
        probation_end_date: defaultProbationEndDate(dateOfHire),
      })
      .select()
      .single();
    if (empErr) throw new Error(empErr.message);

    await c.supabase.from("employee_job_history").insert({
      employee_id: employee.id,
      effective_from: dateOfHire,
      department: requisition.department,
      job_title: requisition.role,
      employment_type: "Permanent",
      reason: "Hired",
    });

    const { error: candErr } = await c.supabase
      .from("candidates")
      .update({ stage: "Hired", employee_id: employee.id, rejection_reason: null })
      .eq("id", candidateId);
    if (candErr) throw new Error(candErr.message);

    refresh(requisitionId, candidateId);
    revalidatePath("/dashboard/employees");
    redirect("/dashboard/employees");
  });
}
