"use server";

// Review, submission and decision of reward recommendations. Managers (for
// their direct reports) and HR review and submit; approval runs through the
// shared approval engine; the approved outcome is committed once, to payroll
// (earnings) or to the pay record (merit increase).
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createApprovalRequest, type ApprovalStepInput } from "@/lib/approvals/create-approval-request";
import { decideApprovalStep } from "@/lib/approvals/decide-approval-step";
import { applyCompensationChange } from "@/lib/compensation/apply-change";
import { bonusWithinDiscretion, computeMerit, roundMoney } from "./engine";
import { mergePolicy, monthOf, requireRewardHr, requireRewardReviewer, rewardAudit, todayIso, type Db, type RewardContext } from "./context";
import type { RewardPolicyConfig } from "./config";
import { DEFAULT_CHAIN, pickWorkflow, resolveStages, type Workflow } from "./approval-chain";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

type Rec = {
  id: string;
  org_id: string;
  cycle_id: string | null;
  pool_id: string | null;
  employee_id: string;
  reward_type: string;
  calculated_amount: number;
  recommended_amount: number;
  current_salary: number | null;
  new_salary: number | null;
  pct: number | null;
  status: string;
  is_exception: boolean;
  justification: string | null;
  snapshot: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  payout_period: string | null;
  recommended_by: string | null;
};

async function loadRec(ctx: RewardContext, recId: string): Promise<Rec> {
  const { data } = await ctx.supabase.from("reward_recommendations").select("*").eq("id", recId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new Error("Recommendation not found, or it is outside your team.");
  if (ctx.employeeId && data.employee_id === ctx.employeeId) throw new Error("You cannot act on your own reward.");
  return data as unknown as Rec;
}

async function policyFor(db: Db, orgId: string, cycleId: string | null): Promise<RewardPolicyConfig> {
  if (cycleId) {
    const { data: c } = await db.from("reward_cycles").select("policy_id").eq("id", cycleId).maybeSingle();
    if (c) {
      const { data: p } = await db.from("reward_policies").select("config").eq("id", c.policy_id).maybeSingle();
      if (p) return mergePolicy(p.config);
    }
  }
  const { data: p } = await db.from("reward_policies").select("config").eq("org_id", orgId).order("version", { ascending: false }).limit(1).maybeSingle();
  return mergePolicy(p?.config);
}

// ---- Adjust within limits; outside them it is an exception that needs a reason ----
export async function adjustRecommendation(recId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const rec = await loadRec(ctx, recId);
    if (!["Draft", "Open"].includes(rec.status)) throw new Error("This recommendation has been submitted and can no longer be changed here.");
    if (rec.snapshot?.eligibility?.result === "excluded") throw new Error("This employee is not eligible, so there is nothing to adjust.");
    const justification = str(formData.get("justification"));
    const policy = await policyFor(ctx.supabase, ctx.orgId, rec.cycle_id);

    const before = { recommended: rec.recommended_amount, pct: rec.pct, newSalary: rec.new_salary, exception: rec.is_exception };
    const update: Record<string, unknown> = {};

    if (rec.reward_type === "merit") {
      const pct = Number(str(formData.get("pct")));
      if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new Error("Enter the increase as a percentage between 0 and 50.");
      const salary = Number(rec.current_salary);
      const m = computeMerit({
        salary,
        rating: rec.snapshot.rating,
        position: rec.snapshot.position,
        bandMax: rec.snapshot.bandMax ?? null,
        policy,
        overridePct: pct,
      });
      const aboveMax = m.exceedsBandMax && !policy.merit.allowAboveBandMax;
      const exception = m.outsideRange || aboveMax;
      if (exception && justification.length < 10) {
        throw new Error(
          m.outsideRange
            ? `${pct}% is outside the ${m.cell.min}–${m.cell.max}% range for this rating and band position. Write a reason (at least 10 characters) to submit it as an exception.`
            : "This increase takes the salary above the top of the band. Write a reason (at least 10 characters) to submit it as an exception."
        );
      }
      Object.assign(update, { pct, new_salary: m.newSalary, recommended_amount: (m.newSalary - salary) * 12, is_exception: exception, justification: justification || null });
    } else {
      const amount = Number(str(formData.get("amount")));
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter the amount in KES.");
      const calc = Number(rec.calculated_amount);
      const within = rec.reward_type === "spot" ? amount <= calc : bonusWithinDiscretion(calc, amount, policy.bonus.discretionPct);
      if (!within && justification.length < 10) {
        throw new Error(
          rec.reward_type === "spot"
            ? "A spot award cannot be raised above the nominated amount without a reason (at least 10 characters)."
            : `${fmt(amount)} is more than ${policy.bonus.discretionPct}% away from the calculated ${fmt(calc)}. Write a reason (at least 10 characters) to submit it as an exception.`
        );
      }
      Object.assign(update, { recommended_amount: roundMoney(amount, policy.roundingDecimals), is_exception: !within, justification: justification || null });
    }

    const { error } = await ctx.supabase.from("reward_recommendations").update(update).eq("id", recId);
    if (error) throw new Error(error.message);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "recommendation.adjusted", recordType: "reward_recommendation", recordId: recId, before, after: update, reason: justification || null });
    revalidatePath(`/dashboard/rewards/recommendations/${recId}`);
    if (rec.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${rec.cycle_id}`);
  });
}

async function headUserId(db: Db, orgId: string): Promise<string | null> {
  const { data: head } = await db.from("employees").select("id").eq("org_id", orgId).eq("is_head_of_organisation", true).maybeSingle();
  if (!head) return null;
  const { data: u } = await db.from("app_users").select("id").eq("employee_id", head.id).maybeSingle();
  return (u?.id as string | undefined) ?? null;
}

// ---- Submit for approval ----
async function submitOne(ctx: RewardContext, recId: string) {
  const rec = await loadRec(ctx, recId);
  if (rec.status !== "Open") throw new Error("Only an open recommendation can be submitted.");
  if (rec.snapshot?.eligibility?.result === "excluded") throw new Error("This employee is not eligible.");
  if (Number(rec.recommended_amount) <= 0) throw new Error("There is nothing to approve: the amount is zero.");
  if (rec.is_exception && (rec.justification ?? "").length < 10) throw new Error("An exception needs a written reason before it can be submitted.");

  if (rec.cycle_id) {
    const { data: cycle } = await ctx.supabase.from("reward_cycles").select("status").eq("id", rec.cycle_id).maybeSingle();
    if (cycle && !["Open", "Calibration", "Approval"].includes(cycle.status as string)) throw new Error(`The cycle is in ${cycle.status}. Open it before submitting.`);
  }

  // Chain: the most specific configured workflow, else HR (plus the head for exceptions).
  // Whoever recommends never approves.
  const { data: wfRows } = await ctx.supabase.from("reward_approval_workflows").select("id, name, reward_type, min_amount, max_amount, exceptions_only, stages, due_days").eq("org_id", ctx.orgId).eq("is_active", true);
  const wf = pickWorkflow(((wfRows ?? []) as unknown as Workflow[]).map((w) => ({ ...w, min_amount: Number(w.min_amount), max_amount: w.max_amount === null ? null : Number(w.max_amount) })), { rewardType: rec.reward_type, amount: Number(rec.recommended_amount), isException: rec.is_exception });
  const head = await headUserId(ctx.supabase, ctx.orgId);
  const dueAt = new Date(Date.now() + (wf?.due_days ?? DEFAULT_CHAIN.dueDays) * 86_400_000).toISOString();
  const steps: ApprovalStepInput[] = resolveStages(wf?.stages ?? DEFAULT_CHAIN.stages, { submitterRole: ctx.role, submitterUserId: ctx.userId, headUserId: head, isException: rec.is_exception, hasWorkflow: !!wf }).map((s) => ({ ...s, dueAt }));

  const name = String(rec.snapshot?.employeeName ?? "employee");
  const label = rec.reward_type === "merit" ? `Merit increase ${rec.pct}% (${fmt(Number(rec.new_salary))}/month)` : `${rec.reward_type.replace("_", " ")} ${fmt(Number(rec.recommended_amount))}`;
  const approvalId = await createApprovalRequest(ctx.supabase, {
    orgId: ctx.orgId,
    requestType: "reward_recommendation",
    entityType: "reward_recommendation",
    entityId: rec.id,
    requestedBy: ctx.userId,
    subjectEmployeeId: rec.employee_id,
    summary: `Reward for ${name}: ${label}${rec.is_exception ? " (exception)" : ""}`,
    impact: { rewardType: rec.reward_type, amount: rec.recommended_amount, exception: rec.is_exception },
    steps,
  });
  const { error } = await ctx.supabase.from("reward_recommendations").update({ status: "In Review", approval_request_id: approvalId, recommended_by: ctx.userId }).eq("id", rec.id);
  if (error) throw new Error(error.message);
  await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "recommendation.submitted", recordType: "reward_recommendation", recordId: rec.id, after: { amount: rec.recommended_amount, exception: rec.is_exception } });
  return rec;
}

export async function submitRecommendation(recId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const rec = await submitOne(ctx, recId);
    revalidatePath(`/dashboard/rewards/recommendations/${recId}`);
    if (rec.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${rec.cycle_id}`);
    revalidatePath("/dashboard/approvals");
  });
}

// Bulk submit: one approval and one audit event per employee (spec §14).
export async function submitAllOpen(cycleId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const { data: recs } = await ctx.supabase.from("reward_recommendations").select("id, snapshot, is_exception, justification").eq("cycle_id", cycleId).eq("status", "Open");
    const open = (recs ?? []).filter((r) => (r.snapshot as { eligibility?: { result?: string } })?.eligibility?.result !== "excluded");
    if (open.length === 0) throw new Error("There is nothing open to submit.");
    let done = 0;
    const problems: string[] = [];
    for (const r of open) {
      try {
        await submitOne(ctx, r.id as string);
        done++;
      } catch (e) {
        const name = String((r.snapshot as { employeeName?: string })?.employeeName ?? "An employee");
        problems.push(`${name}: ${e instanceof Error ? e.message : "could not be submitted"}`);
      }
    }
    revalidatePath(`/dashboard/rewards/cycles/${cycleId}`);
    revalidatePath("/dashboard/approvals");
    if (problems.length > 0) throw new Error(`Submitted ${done}. Still needs you: ${problems.slice(0, 4).join(" · ")}${problems.length > 4 ? ` · and ${problems.length - 4} more` : ""}`);
  });
}

// A rejected item returns to the manager with its reason (spec §12).
export async function reopenRecommendation(recId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardHr();
    const rec = await loadRec(ctx, recId);
    if (rec.status !== "Rejected") throw new Error("Only a rejected recommendation can be reopened.");
    await ctx.supabase.from("reward_recommendations").update({ status: "Open", approval_request_id: null, version: (Number((rec as unknown as { version?: number }).version) || 1) + 1 }).eq("id", recId);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "recommendation.reopened", recordType: "reward_recommendation", recordId: recId });
    revalidatePath(`/dashboard/rewards/recommendations/${recId}`);
    if (rec.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${rec.cycle_id}`);
  });
}

// ---- Spot awards ----
export async function nominateSpotAward(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const ctx = await requireRewardReviewer();
    const staffNo = str(formData.get("staff_no"));
    const amount = Number(str(formData.get("amount")));
    const reason = str(formData.get("reason"));
    const poolId = str(formData.get("pool_id")) || null;
    if (!staffNo) throw new Error("Enter the employee's staff number.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter the award amount in KES.");
    if (reason.length < 10) throw new Error("Say what the award is for (at least 10 characters).");

    const { data: emp } = await ctx.supabase.from("employees").select("id, name, basic, status").eq("org_id", ctx.orgId).eq("staff_no", staffNo).maybeSingle();
    if (!emp) throw new Error(ctx.role === "manager" ? `No one with staff number ${staffNo} is in your team.` : `No employee has staff number ${staffNo}.`);
    if (ctx.employeeId && emp.id === ctx.employeeId) throw new Error("You cannot nominate yourself.");
    if (emp.status !== "Active") throw new Error(`${emp.name} is not an active employee.`);

    if (poolId) {
      const { data: pool } = await ctx.supabase.from("reward_pool_status").select("remaining, name, pool_type").eq("id", poolId).maybeSingle();
      if (!pool) throw new Error("Spot-award pool not found.");
      if (pool.pool_type !== "spot") throw new Error("Choose a spot-award pool.");
      if (Number(pool.remaining) < amount) throw new Error(`${pool.name} has only ${fmt(Number(pool.remaining))} left.`);
    }

    const { data: row, error } = await ctx.supabase
      .from("reward_recommendations")
      .insert({
        org_id: ctx.orgId,
        pool_id: poolId,
        employee_id: emp.id,
        reward_type: "spot",
        calculated_amount: amount,
        recommended_amount: amount,
        current_salary: emp.basic,
        status: "Open",
        justification: reason,
        recommended_by: ctx.userId,
        payout_period: monthOf(todayIso()),
        snapshot: { employeeName: emp.name, nominatedBy: ctx.userId, reason, eligibility: { result: "eligible", factor: 1, reasons: [] } },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await rewardAudit(ctx.supabase, { orgId: ctx.orgId, actorUserId: ctx.userId, event: "spot_award.nominated", recordType: "reward_recommendation", recordId: row.id, after: { amount, staffNo }, reason });
    await submitOne(ctx, row.id as string);
    revalidatePath("/dashboard/rewards/spot");
    revalidatePath("/dashboard/approvals");
  });
}

// ---- Decision (dispatched from the approvals inbox) ----
export async function decideRewardRecommendation(stepId: string, decision: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser) throw new Error("No org context.");

  const { data: stepRow } = await supabase.from("approval_steps").select("approval_requests(entity_id, subject_employee_id)").eq("id", stepId).maybeSingle();
  const req = stepRow?.approval_requests as unknown as { entity_id: string | null; subject_employee_id: string | null } | null;
  const recId = req?.entity_id ?? null;
  if (!recId) throw new Error("Reward recommendation not found.");
  if (appUser.employee_id && req?.subject_employee_id === appUser.employee_id) throw new Error("You cannot approve or reject your own reward.");

  // Budget block: refuse approval while the pool is over budget (spec §12).
  if (decision === "approved") {
    const { data: r } = await supabase.from("reward_recommendations").select("pool_id").eq("id", recId).maybeSingle();
    if (r?.pool_id) {
      const { data: pool } = await supabase.from("reward_pool_status").select("remaining, name").eq("id", r.pool_id).maybeSingle();
      if (pool && Number(pool.remaining) < 0) {
        throw new Error(`${pool.name} is over budget by ${fmt(Math.abs(Number(pool.remaining)))}. Raise the pool (with a reason) or reduce the recommendations before approving.`);
      }
    }
  }

  const { requestId, requestStatus } = await decideApprovalStep(supabase, { stepId, orgId: appUser.org_id, decision });

  if (decision === "approved" && requestStatus !== "approved") {
    revalidatePath("/dashboard/approvals");
    return { requestId };
  }

  // Everything below runs with the service client, but only AFTER the
  // approval engine accepted this signed-in person's decision above.
  const db = createAdminClient() as Db;
  const { data: rec } = await db.from("reward_recommendations").select("*").eq("id", recId).eq("org_id", appUser.org_id).maybeSingle();
  if (!rec) throw new Error("Reward recommendation not found.");

  if (decision === "rejected") {
    await db.from("reward_recommendations").update({ status: "Rejected" }).eq("id", recId);
    await rewardAudit(db, { orgId: appUser.org_id, actorUserId: user.id, event: "recommendation.rejected", recordType: "reward_recommendation", recordId: recId });
  } else {
    await commitApproved(db, rec as unknown as Rec, appUser.org_id, user.id, requestId);
  }
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/rewards");
  if (rec.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${rec.cycle_id}`);
  return { requestId };
}

// Writes the approved outcome exactly once (reward_transactions.recommendation_id is unique).
async function commitApproved(db: Db, rec: Rec, orgId: string, actorId: string, approvalRequestId: string) {
  const { data: already } = await db.from("reward_transactions").select("id").eq("recommendation_id", rec.id).maybeSingle();
  if (already) return;

  let effective = todayIso();
  if (rec.cycle_id) {
    const { data: cycle } = await db.from("reward_cycles").select("effective_date").eq("id", rec.cycle_id).maybeSingle();
    if (cycle?.effective_date) effective = cycle.effective_date as string;
  }

  if (rec.reward_type === "merit") {
    const { data: cr, error } = await db
      .from("compensation_change_requests")
      .insert({
        org_id: orgId,
        employee_id: rec.employee_id,
        requested_by: rec.recommended_by ?? actorId,
        status: "approved",
        proposed_basic: rec.new_salary,
        effective_from: effective,
        reason: `Merit increase ${rec.pct}% (rewards cycle, policy v${rec.snapshot?.policyVersion ?? "?"})`,
        approval_request_id: approvalRequestId,
        decided_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (effective <= todayIso()) await applyCompensationChange(db, cr.id as string, actorId);
    else await db.from("compensation_change_requests").update({ status: "scheduled" }).eq("id", cr.id);
    await db.from("reward_transactions").insert({ org_id: orgId, recommendation_id: rec.id, employee_id: rec.employee_id, tx_type: "salary_change", amount: Number(rec.new_salary) - Number(rec.current_salary), new_salary: rec.new_salary, effective_date: effective, payroll_status: "pending", change_request_id: cr.id });
  } else {
    const period = rec.payout_period ?? monthOf(effective > todayIso() ? effective : todayIso());
    await db.from("reward_transactions").insert({ org_id: orgId, recommendation_id: rec.id, employee_id: rec.employee_id, tx_type: "earning", amount: rec.recommended_amount, effective_date: effective, payroll_period: period, payroll_status: "pending" });
  }
  await db.from("reward_recommendations").update({ status: "Finalised" }).eq("id", rec.id);
  await rewardAudit(db, { orgId, actorUserId: actorId, event: "recommendation.approved_and_committed", recordType: "reward_recommendation", recordId: rec.id, after: { type: rec.reward_type, amount: rec.recommended_amount, effective } });
}
