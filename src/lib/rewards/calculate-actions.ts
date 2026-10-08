"use server";

// Calculation actions: turn locked performance results and approved scheme
// actuals into recommendations. All maths runs here on the server through
// the pure engine; each result stores a snapshot of its inputs.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { bandFor, checkEligibility, computeBonus, computeMerit, computeSchemePayout, rangePositionOf, scoreToPct, type SchemeConfig } from "./engine";
import { mergePolicy, monthOf, requireRewardHr, rewardAudit, todayIso } from "./context";

const TYPE_FOR_SCHEME: Record<string, string> = {
  sales: "incentive",
  project: "incentive",
  team: "incentive",
  retention: "retention",
  referral: "referral",
  long_service: "long_service",
  spot: "spot",
};

export async function generateRecommendations(cycleId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId, employeeId: ownEmployeeId } = await requireRewardHr();

    const { data: cycle } = await supabase.from("reward_cycles").select("*").eq("id", cycleId).eq("org_id", orgId).maybeSingle();
    if (!cycle) throw new Error("Cycle not found.");
    if (!["Planning", "Open", "Calibration"].includes(cycle.status as string)) throw new Error("Recommendations cannot be recalculated once the cycle is in approval.");

    const { data: policyRow } = await supabase.from("reward_policies").select("version, config").eq("id", cycle.policy_id).maybeSingle();
    if (!policyRow) throw new Error("The cycle's policy could not be found.");
    const policy = mergePolicy(policyRow.config);

    const [{ data: employees }, { data: pools }, { data: existing }] = await Promise.all([
      supabase.from("employees").select("id, name, department, basic, status, employment_type, date_of_hire, probation_end_date").eq("org_id", orgId).eq("status", "Active"),
      supabase.from("reward_pools").select("id, pool_type").eq("cycle_id", cycleId),
      supabase.from("reward_recommendations").select("id, employee_id, reward_type, status").eq("cycle_id", cycleId).is("scheme_id", null),
    ]);
    const ids = (employees ?? []).map((e) => e.id as string);
    if (ids.length === 0) throw new Error("There are no active employees to review.");

    const [{ data: appraisals }, { data: cases }, { data: history }, { data: grades }, { data: bands }] = await Promise.all([
      supabase.from("appraisals").select("employee_id, final_score, status, created_at").eq("cycle", cycle.performance_cycle).eq("status", "Completed").in("employee_id", ids),
      supabase.from("disciplinary_actions").select("employee_id").is("outcome", null).in("employee_id", ids),
      supabase.from("employee_compensation_history").select("employee_id, grade_id").is("effective_to", null).in("employee_id", ids),
      supabase.from("compensation_grades").select("id, code, name, bonus_target_pct").eq("org_id", orgId),
      supabase.from("compensation_bands").select("grade_id, min_amount, max_amount, effective_from, effective_to").eq("org_id", orgId).lte("effective_from", cycle.effective_date),
    ]);

    // Only completed (locked) appraisals count; the latest one wins.
    const scoreBy = new Map<string, number>();
    for (const a of [...(appraisals ?? [])].sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)))) {
      if (a.final_score !== null) scoreBy.set(a.employee_id as string, Number(a.final_score));
    }
    const openCase = new Set((cases ?? []).map((c) => c.employee_id as string));
    const gradeOf = new Map((history ?? []).filter((h) => h.grade_id).map((h) => [h.employee_id as string, h.grade_id as string]));
    const gradeRow = new Map((grades ?? []).map((g) => [g.id as string, g]));
    const bandOf = new Map<string, { min: number; max: number }>();
    for (const b of [...(bands ?? [])].sort((x, y) => String(x.effective_from).localeCompare(String(y.effective_from)))) {
      if (!b.effective_to || b.effective_to >= cycle.effective_date) bandOf.set(b.grade_id as string, { min: Number(b.min_amount), max: Number(b.max_amount) });
    }

    // Anything already in review or beyond is left alone; the rest is recalculated.
    const locked = new Set((existing ?? []).filter((r) => !["Draft", "Open"].includes(r.status as string)).map((r) => `${r.employee_id}:${r.reward_type}`));
    const replaceIds = (existing ?? []).filter((r) => ["Draft", "Open"].includes(r.status as string)).map((r) => r.id as string);
    if (replaceIds.length > 0) await supabase.from("reward_recommendations").delete().in("id", replaceIds);

    const meritPool = (pools ?? []).find((p) => p.pool_type === "merit")?.id ?? null;
    const bonusPool = (pools ?? []).find((p) => p.pool_type === "bonus")?.id ?? null;
    const payoutPeriod = monthOf(cycle.effective_date > todayIso() ? cycle.effective_date : todayIso());

    const rows: Record<string, unknown>[] = [];
    for (const e of employees ?? []) {
      const salary = Number(e.basic ?? 0);
      if (salary <= 0) continue;
      if (ownEmployeeId && e.id === ownEmployeeId) continue; // nobody acts on their own record
      const rawScore = scoreBy.get(e.id as string);
      const scorePct = rawScore === undefined ? null : scoreToPct(rawScore);
      const elig = checkEligibility(
        {
          status: e.status as string,
          employmentType: e.employment_type as string,
          dateOfHire: e.date_of_hire as string,
          probationEndDate: (e.probation_end_date as string | null) ?? null,
          scorePct,
          hasOpenDiscipline: openCase.has(e.id as string),
          periodStart: cycle.period_start,
          periodEnd: cycle.period_end,
          asOf: cycle.effective_date,
        },
        policy
      );
      const gradeId = gradeOf.get(e.id as string) ?? null;
      const grade = gradeId ? gradeRow.get(gradeId) : undefined;
      const band = gradeId ? bandOf.get(gradeId) ?? null : null;
      const perf = scorePct === null ? null : bandFor(scorePct, policy.bands);
      const pos = rangePositionOf(salary, band?.min ?? null, band?.max ?? null, policy);

      const snapshot: Record<string, unknown> = {
        employeeName: e.name,
        department: e.department,
        salary,
        grade: grade ? `${grade.code} ${grade.name}` : null,
        scorePct,
        rating: perf?.rating ?? null,
        performanceFactor: perf?.factor ?? null,
        eligibility: { result: elig.result, factor: elig.factor, reasons: elig.reasons, missingEvidence: elig.missingEvidence },
        bandMin: band?.min ?? null,
        bandMax: band?.max ?? null,
        position: pos.position,
        rangeRatio: pos.ratio,
        policyVersion: policyRow.version,
        companyFactor: Number(cycle.company_factor),
        asOf: cycle.effective_date,
      };

      const base = { org_id: orgId, cycle_id: cycleId, employee_id: e.id, current_salary: salary, policy_version: policyRow.version, recommended_by: userId, payout_period: payoutPeriod };
      const excluded = elig.result === "excluded" || perf === null;

      if (!locked.has(`${e.id}:merit`)) {
        if (excluded) {
          rows.push({ ...base, reward_type: "merit", pool_id: meritPool, status: "Draft", calculated_amount: 0, recommended_amount: 0, snapshot });
        } else {
          const m = computeMerit({ salary, rating: perf.rating, position: pos.position, bandMax: band?.max ?? null, policy });
          const flagged = m.exceedsBandMax && !policy.merit.allowAboveBandMax;
          rows.push({
            ...base,
            reward_type: "merit",
            pool_id: meritPool,
            calculated_amount: (m.newSalary - salary) * 12,
            recommended_amount: (m.newSalary - salary) * 12,
            new_salary: m.newSalary,
            pct: m.proposedPct,
            is_exception: flagged,
            status: m.newSalary > salary ? "Open" : "Draft",
            snapshot: { ...snapshot, merit: { cell: m.cell, proposedPct: m.proposedPct, exceedsBandMax: m.exceedsBandMax } },
          });
        }
      }

      if (!locked.has(`${e.id}:bonus`)) {
        if (excluded) {
          rows.push({ ...base, reward_type: "bonus", pool_id: bonusPool, status: "Draft", calculated_amount: 0, recommended_amount: 0, snapshot });
        } else {
          const targetPct = grade?.bonus_target_pct != null ? Number(grade.bonus_target_pct) : policy.bonus.defaultTargetPct;
          const b = computeBonus({
            monthlySalary: salary,
            targetPct,
            performanceFactor: perf.factor,
            companyFactor: Number(cycle.company_factor),
            eligibilityFactor: elig.factor,
            capPctOfTarget: policy.bonus.capPctOfTarget,
            decimals: policy.roundingDecimals,
          });
          rows.push({
            ...base,
            reward_type: "bonus",
            pool_id: bonusPool,
            calculated_amount: b.amount,
            recommended_amount: b.amount,
            status: b.amount > 0 ? "Open" : "Draft",
            snapshot: { ...snapshot, bonus: { targetPct, ...b } },
          });
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("reward_recommendations").insert(rows.map((r) => ({ is_exception: false, new_salary: null, pct: null, ...r })));
      if (error) throw new Error(error.message);
    }
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "recommendations.calculated", recordType: "reward_cycle", recordId: cycleId, after: { rows: rows.length, policyVersion: policyRow.version } });
    revalidatePath(`/dashboard/rewards/cycles/${cycleId}`);
    revalidatePath("/dashboard/rewards");
  });
}

// Incentive payouts for one scheme and period, from HR-approved actuals.
export async function calculateScheme(schemeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId, employeeId: ownEmployeeId } = await requireRewardHr();
    const period = String(formData.get("period") ?? "").trim();
    if (!period) throw new Error("Choose the period to calculate.");

    const { data: scheme } = await supabase.from("reward_schemes").select("*").eq("id", schemeId).eq("org_id", orgId).maybeSingle();
    if (!scheme) throw new Error("Scheme not found.");
    if (!scheme.is_active) throw new Error("This scheme is switched off.");

    const { data: actuals } = await supabase.from("scheme_actuals").select("employee_id, metric_value, status").eq("scheme_id", schemeId).eq("period", period);
    const approved = (actuals ?? []).filter((a) => a.status === "approved");
    if (approved.length === 0) throw new Error((actuals ?? []).length > 0 ? "Those results are not approved yet. Approve them first." : "There are no results for that period.");

    const { data: policyRow } = await supabase.from("reward_policies").select("version, config").eq("org_id", orgId).order("version", { ascending: false }).limit(1).maybeSingle();
    const policy = mergePolicy(policyRow?.config);
    const schemePolicy = { ...policy, eligibility: { ...policy.eligibility, minServiceMonths: 0, requireConfirmed: false, minScorePct: 0 } };
    const today = todayIso();
    const payoutPeriod = monthOf(today);

    const empIds = approved.map((a) => a.employee_id as string);
    const [{ data: emps }, { data: cases }, { data: already }] = await Promise.all([
      supabase.from("employees").select("id, name, department, basic, status, employment_type, date_of_hire, probation_end_date").eq("org_id", orgId).in("id", empIds),
      supabase.from("disciplinary_actions").select("employee_id").is("outcome", null).in("employee_id", empIds),
      supabase.from("reward_recommendations").select("employee_id").eq("scheme_id", schemeId).eq("payout_period", payoutPeriod),
    ]);
    const openCase = new Set((cases ?? []).map((c) => c.employee_id as string));
    const done = new Set((already ?? []).map((r) => r.employee_id as string));
    const departments: string[] = (scheme.eligible as { departments?: string[] } | null)?.departments ?? [];
    const empBy = new Map((emps ?? []).map((e) => [e.id as string, e]));

    const rows: Record<string, unknown>[] = [];
    for (const a of approved) {
      const e = empBy.get(a.employee_id as string);
      if (!e || done.has(e.id as string)) continue;
      if (ownEmployeeId && e.id === ownEmployeeId) continue;
      if (departments.length > 0 && !departments.includes(e.department as string)) continue;
      const elig = checkEligibility(
        { status: e.status as string, employmentType: e.employment_type as string, dateOfHire: e.date_of_hire as string, probationEndDate: null, scorePct: 100, hasOpenDiscipline: openCase.has(e.id as string), periodStart: today, periodEnd: today, asOf: today },
        schemePolicy
      );
      const salary = Number(e.basic ?? 0);
      const p = computeSchemePayout({ config: scheme.config as SchemeConfig, metricValue: Number(a.metric_value), monthlySalary: salary, eligibilityFactor: elig.factor, decimals: policy.roundingDecimals });
      rows.push({
        org_id: orgId,
        scheme_id: schemeId,
        pool_id: scheme.pool_id,
        employee_id: e.id,
        reward_type: TYPE_FOR_SCHEME[scheme.scheme_type as string] ?? "incentive",
        calculated_amount: p.amount,
        recommended_amount: p.amount,
        current_salary: salary,
        status: p.amount > 0 ? "Open" : "Draft",
        policy_version: policyRow?.version ?? null,
        recommended_by: userId,
        payout_period: payoutPeriod,
        snapshot: {
          employeeName: e.name,
          department: e.department,
          salary,
          scheme: scheme.name,
          period,
          metricValue: Number(a.metric_value),
          schemeConfig: scheme.config,
          payout: p,
          eligibility: { result: elig.result, factor: elig.factor, reasons: elig.reasons },
        },
      });
    }
    if (rows.length === 0) throw new Error("Nothing new to calculate: every employee with results for that period already has a payout recommendation (or is outside the scheme's group).");
    const { error } = await supabase.from("reward_recommendations").insert(rows.map((r) => ({ is_exception: false, new_salary: null, pct: null, ...r })));
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "scheme.calculated", recordType: "reward_scheme", recordId: schemeId, after: { period, rows: rows.length } });
    revalidatePath("/dashboard/rewards");
    revalidatePath("/dashboard/rewards/schemes");
    revalidatePath("/dashboard/rewards/recommendations");
  });
}
