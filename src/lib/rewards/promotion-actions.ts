"use server";

// Promotion cases (spec §9): open a case for someone who passes every gate,
// score their readiness, send it through approval, and on approval update
// grade, title and salary and file the letter.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApprovalRequest, type ApprovalStepInput } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { applyCompensationChange } from "@/lib/compensation/apply-change";
import { mergePolicy, requireRewardHr, requireRewardReviewer, rewardAudit, todayIso, type Db, type RewardContext } from "./context";
import { fileLetter } from "./letters";
import { buildCandidates } from "./promotion-data";
import { DEFAULT_PROMOTION_RULE, promotedSalary, promotionLetter, readinessScore, type PromotionRuleConfig } from "./promotion-engine";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const num = (v: FormDataEntryValue | null, fb = 0) => {
  const n = Number(str(v));
  return str(v) !== "" && Number.isFinite(n) ? n : fb;
};

export async function savePromotionRule(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const from = str(formData.get("from_grade_id"));
    const to = str(formData.get("to_grade_id"));
    if (!from || !to) throw new Error("Choose the grade being promoted from and to.");
    if (from === to) throw new Error("The two grades must be different.");
    const d = DEFAULT_PROMOTION_RULE;
    const config: PromotionRuleConfig = {
      minPerformancePct: num(formData.get("min_perf"), d.minPerformancePct),
      performanceCycles: Math.max(1, Math.round(num(formData.get("perf_cycles"), d.performanceCycles))),
      minMonthsInGrade: num(formData.get("min_months"), d.minMonthsInGrade),
      requireVacancy: formData.get("require_vacancy") === "on",
      upliftPct: num(formData.get("uplift"), d.upliftPct),
      weights: {
        performance: num(formData.get("w_performance"), d.weights.performance),
        competencies: num(formData.get("w_competencies"), d.weights.competencies),
        experience: num(formData.get("w_experience"), d.weights.experience),
        qualifications: num(formData.get("w_qualifications"), d.weights.qualifications),
        leadership: num(formData.get("w_leadership"), d.weights.leadership),
        values: num(formData.get("w_values"), d.weights.values),
      },
      cutoffs: { stronglyRecommended: num(formData.get("cut_strong"), d.cutoffs.stronglyRecommended), recommended: num(formData.get("cut_rec"), d.cutoffs.recommended), developmentNeeded: num(formData.get("cut_dev"), d.cutoffs.developmentNeeded) },
    };
    const w = config.weights;
    const total = w.performance + w.competencies + w.experience + w.qualifications + w.leadership + w.values;
    if (Math.round(total) !== 100) throw new Error(`Readiness weights must total 100% (they total ${total}%).`);
    if (!(config.cutoffs.stronglyRecommended > config.cutoffs.recommended && config.cutoffs.recommended > config.cutoffs.developmentNeeded)) throw new Error("Score cut-offs must run from strongly recommended down to development needed.");
    const { data: row, error } = await supabase.from("promotion_rules").upsert({ org_id: orgId, from_grade_id: from, to_grade_id: to, config, is_active: true, created_by: userId }, { onConflict: "org_id,from_grade_id,to_grade_id" }).select("id").single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "promotion_rule.saved", recordType: "promotion_rule", recordId: row.id, after: config });
    revalidatePath("/dashboard/rewards/promotions");
    revalidatePath("/dashboard/rewards/promotions/rules");
  });
}

export async function removePromotionRule(ruleId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    await supabase.from("promotion_rules").update({ is_active: false }).eq("id", ruleId).eq("org_id", orgId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "promotion_rule.removed", recordType: "promotion_rule", recordId: ruleId });
    revalidatePath("/dashboard/rewards/promotions/rules");
  });
}

function assessmentFrom(formData: FormData) {
  const pct = (k: string) => Math.max(0, Math.min(100, num(formData.get(k), 0)));
  return { competencies: pct("competencies"), qualifications: pct("qualifications"), leadership: pct("leadership"), values: pct("values") };
}

async function evaluate(ctx: RewardContext, employeeId: string, ruleId: string, proposedTitle: string, effective: string, a: ReturnType<typeof assessmentFrom>) {
  const cands = await buildCandidates(ctx.supabase, ctx.orgId, { employeeId, asOf: effective, proposedTitle });
  const cand = cands.find((c) => c.rule.id === ruleId);
  if (!cand) throw new Error("This employee is not in the grade this rule promotes from, or the rule is switched off.");
  if (!cand.allPassed) {
    const failed = cand.gates.filter((g) => !g.passed).map((g) => `${g.label} — ${g.detail}`);
    throw new Error(`Not eligible yet. Failed: ${failed.join(" · ")}`);
  }
  const { data: policyRow } = await ctx.supabase.from("reward_policies").select("config").eq("org_id", ctx.orgId).order("version", { ascending: false }).limit(1).maybeSingle();
  const decimals = mergePolicy(policyRow?.config).roundingDecimals;
  const ready = readinessScore({ avgPerformancePct: cand.avgPerformancePct, monthsInGrade: cand.monthsInGrade, competenciesPct: a.competencies, qualificationsPct: a.qualifications, leadershipPct: a.leadership, valuesPct: a.values }, cand.rule.config);
  const proposedSalary = promotedSalary(cand.salary, cand.rule.config.upliftPct, cand.newBandMin, decimals);
  return { cand, ready, proposedSalary };
}

export async function openPromotionCase(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const employeeId = str(formData.get("employee_id"));
    const ruleId = str(formData.get("rule_id"));
    const title = str(formData.get("proposed_title"));
    const effective = str(formData.get("effective_date"));
    const justification = str(formData.get("justification"));
    if (!employeeId || !ruleId) throw new Error("Choose an employee from the readiness list.");
    if (ctx.employeeId && employeeId === ctx.employeeId) throw new Error("You cannot open a promotion case for yourself.");
    if (!title) throw new Error("Enter the new job title.");
    if (!effective) throw new Error("Enter the effective date.");
    if (justification.length < 20) throw new Error("Write a justification of at least 20 characters.");
    const a = assessmentFrom(formData);
    const { cand, ready, proposedSalary } = await evaluate(ctx, employeeId, ruleId, title, effective, a);

    const { data: row, error } = await ctx.supabase
      .from("promotion_cases")
      .insert({
        org_id: ctx.orgId,
        employee_id: employeeId,
        rule_id: ruleId,
        from_grade_id: cand.fromGradeId,
        to_grade_id: cand.rule.to_grade_id,
        current_title: cand.jobTitle,
        proposed_title: title,
        current_salary: cand.salary,
        proposed_salary: proposedSalary,
        effective_date: effective,
        gate_results: cand.gates,
        assessment: { ...a, parts: ready.parts, avgPerformancePct: cand.avgPerformancePct, monthsInGrade: cand.monthsInGrade, employeeName: cand.name, department: cand.department },
        readiness_score: ready.score,
        readiness_label: ready.label,
        justification,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message.includes("promotion_cases_one_live") ? "This employee already has a live promotion case." : error.message);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "promotion_case.opened", recordType: "promotion_case", recordId: row.id, after: { to: title, readiness: ready.score, proposedSalary } });
    revalidatePath("/dashboard/rewards/promotions");
  });
}

// Draft cases can be re-scored after the manager revises the assessment.
export async function reassessPromotionCase(caseId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const { data: c } = await ctx.supabase.from("promotion_cases").select("*").eq("id", caseId).eq("org_id", ctx.orgId).maybeSingle();
    if (!c) throw new Error("Case not found, or it is outside your team.");
    if (c.status !== "Draft") throw new Error("Only a draft case can be changed.");
    if (ctx.employeeId && c.employee_id === ctx.employeeId) throw new Error("You cannot change your own promotion case.");
    const a = assessmentFrom(formData);
    const title = str(formData.get("proposed_title")) || (c.proposed_title as string);
    const justification = str(formData.get("justification")) || (c.justification as string);
    if (justification.length < 20) throw new Error("Write a justification of at least 20 characters.");
    const { cand, ready, proposedSalary } = await evaluate(ctx, c.employee_id as string, c.rule_id as string, title, c.effective_date as string, a);
    await ctx.supabase
      .from("promotion_cases")
      .update({ proposed_title: title, justification, proposed_salary: proposedSalary, gate_results: cand.gates, readiness_score: ready.score, readiness_label: ready.label, assessment: { ...a, parts: ready.parts, avgPerformancePct: cand.avgPerformancePct, monthsInGrade: cand.monthsInGrade, employeeName: cand.name, department: cand.department } })
      .eq("id", caseId);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "promotion_case.reassessed", recordType: "promotion_case", recordId: caseId, before: { readiness: c.readiness_score }, after: { readiness: ready.score } });
    revalidatePath(`/dashboard/rewards/promotions/${caseId}`);
  });
}

async function headUserId(db: Db, orgId: string): Promise<string | null> {
  const { data: head } = await db.from("employees").select("id").eq("org_id", orgId).eq("is_head_of_organisation", true).maybeSingle();
  if (!head) return null;
  const { data: u } = await db.from("app_users").select("id").eq("employee_id", head.id).maybeSingle();
  return (u?.id as string | undefined) ?? null;
}

export async function submitPromotionCase(caseId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const { data: c } = await ctx.supabase.from("promotion_cases").select("*").eq("id", caseId).eq("org_id", ctx.orgId).maybeSingle();
    if (!c) throw new Error("Case not found, or it is outside your team.");
    if (c.status !== "Draft") throw new Error("Only a draft case can be submitted.");
    if (ctx.employeeId && c.employee_id === ctx.employeeId) throw new Error("You cannot submit your own promotion case.");
    if (c.readiness_label === "Not Ready") throw new Error("The readiness score is Not Ready. Improve the assessment or defer the case with a development plan.");

    // HR check, then the head of the organisation. Whoever opens the case never approves it.
    const steps: ApprovalStepInput[] = [{ approverRole: ctx.role === "hr" ? "admin" : "hr" }];
    const head = await headUserId(ctx.supabase, ctx.orgId);
    if (head && head !== ctx.userId) steps.push({ approverUserId: head });

    const name = String((c.assessment as { employeeName?: string })?.employeeName ?? "employee");
    const approvalId = await createApprovalRequest(ctx.supabase, {
      orgId: ctx.orgId,
      requestType: "promotion_case",
      entityType: "promotion_case",
      entityId: caseId,
      requestedBy: ctx.userId,
      subjectEmployeeId: c.employee_id as string,
      summary: `Promotion for ${name}: ${c.current_title ?? "current role"} → ${c.proposed_title} (KES ${Math.round(Number(c.proposed_salary)).toLocaleString("en-KE")}/month, ${c.readiness_label})`,
      impact: { readiness: c.readiness_score, proposedSalary: c.proposed_salary },
      steps,
    });
    await ctx.supabase.from("promotion_cases").update({ status: "In Review", approval_request_id: approvalId }).eq("id", caseId);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "promotion_case.submitted", recordType: "promotion_case", recordId: caseId });
    revalidatePath(`/dashboard/rewards/promotions/${caseId}`);
    revalidatePath("/dashboard/approvals");
  });
}

// Defer with a development plan, so the next cycle starts from it (spec §9).
export async function deferPromotionCase(caseId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardHr();
    const plan = str(formData.get("development_plan"));
    if (plan.length < 20) throw new Error("Write the development plan (at least 20 characters).");
    const { data: c } = await ctx.supabase.from("promotion_cases").select("status, employee_id, approval_request_id").eq("id", caseId).eq("org_id", ctx.orgId).maybeSingle();
    if (!c) throw new Error("Case not found.");
    if (!["Draft", "In Review"].includes(c.status as string)) throw new Error("Only a draft or in-review case can be deferred.");
    if (ctx.employeeId && c.employee_id === ctx.employeeId) throw new Error("You cannot decide your own promotion case.");
    if (c.approval_request_id) await ctx.supabase.from("approval_requests").update({ status: "cancelled" }).eq("id", c.approval_request_id);
    await ctx.supabase.from("promotion_cases").update({ status: "Deferred", development_plan: plan, decision_reason: "Deferred with a development plan" }).eq("id", caseId);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "promotion_case.deferred", recordType: "promotion_case", recordId: caseId, reason: plan });
    revalidatePath(`/dashboard/rewards/promotions/${caseId}`);
    revalidatePath("/dashboard/approvals");
  });
}

// Dispatched from the approvals inbox (request_type 'promotion_case').
export async function decidePromotionCase(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase.from("approval_steps").select("approval_requests(entity_id, subject_employee_id)").eq("id", stepId).maybeSingle();
  const req = stepRow?.approval_requests as unknown as { entity_id: string | null; subject_employee_id: string | null } | null;
  const caseId = req?.entity_id ?? null;
  if (!caseId) throw new Error("Promotion case not found.");
  if (appUser.employee_id && req?.subject_employee_id === appUser.employee_id) throw new Error("You cannot approve or reject your own promotion.");

  const { requestId, requestStatus } = await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });
  if (decision === "approved" && requestStatus !== "approved") {
    revalidatePath("/dashboard/approvals");
    return { requestId };
  }

  // Commit with the service client, only after the engine accepted this person's decision.
  const db = createAdminClient() as Db;
  const { data: c } = await db.from("promotion_cases").select("*").eq("id", caseId).eq("org_id", appUser.org_id).maybeSingle();
  if (!c) throw new Error("Promotion case not found.");

  if (decision === "rejected") {
    await db.from("promotion_cases").update({ status: "Rejected", decision_reason: "Declined at approval" }).eq("id", caseId);
    await rewardAudit(db, { orgId: appUser.org_id, actorUserId: user.id, event: "promotion_case.declined", recordType: "promotion_case", recordId: caseId });
  } else if (c.status === "In Review") {
    const today = todayIso();
    const { data: cr, error } = await db
      .from("compensation_change_requests")
      .insert({
        org_id: appUser.org_id,
        employee_id: c.employee_id,
        requested_by: c.created_by ?? user.id,
        status: "approved",
        proposed_grade_id: c.to_grade_id,
        proposed_basic: c.proposed_salary,
        effective_from: c.effective_date,
        reason: `Promotion to ${c.proposed_title}`,
        approval_request_id: requestId,
        decided_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const immediate = (c.effective_date as string) <= today;
    if (immediate) {
      await applyCompensationChange(db, cr.id as string, user.id);
      await db.from("employees").update({ job_title: c.proposed_title }).eq("id", c.employee_id);
    } else {
      await db.from("compensation_change_requests").update({ status: "scheduled" }).eq("id", cr.id);
    }
    const [{ data: emp }, { data: org }, { data: fromG }, { data: toG }] = await Promise.all([
      db.from("employees").select("name").eq("id", c.employee_id).maybeSingle(),
      db.from("organizations").select("name").eq("id", appUser.org_id).maybeSingle(),
      c.from_grade_id ? db.from("compensation_grades").select("code, name").eq("id", c.from_grade_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("compensation_grades").select("code, name").eq("id", c.to_grade_id).maybeSingle(),
    ]);
    const letter = promotionLetter({
      name: (emp?.name as string) ?? "Colleague",
      fromTitle: (c.current_title as string) ?? "your current role",
      toTitle: c.proposed_title as string,
      fromGrade: fromG ? `${fromG.code} ${fromG.name}` : null,
      toGrade: toG ? `${toG.code} ${toG.name}` : null,
      newSalary: Number(c.proposed_salary),
      effective: c.effective_date as string,
      orgName: (org?.name as string) ?? "Human Resources",
    });
    await db.from("promotion_cases").update({ status: "Finalised", letter_text: letter, decision_reason: immediate ? "Approved and applied" : "Approved; applies on the effective date (update the job title then)" }).eq("id", caseId);
    await fileLetter(db, { orgId: appUser.org_id, employeeId: c.employee_id as string, type: "promotion", title: `Promotion to ${c.proposed_title}`, body: letter, promotionCaseId: caseId });
    await rewardAudit(db, { orgId: appUser.org_id, actorUserId: user.id, event: "promotion_case.approved_and_committed", recordType: "promotion_case", recordId: caseId, after: { title: c.proposed_title, salary: c.proposed_salary, effective: c.effective_date } });
  }
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/rewards/promotions");
  revalidatePath(`/dashboard/rewards/promotions/${caseId}`);
  return { requestId };
}
