"use server";

// Rewards module setup: policy versions, cycles, pools, schemes and the
// results (actuals) that incentives are paid on. HR / administrator only.
import { hrUserIds, notifyRewards } from "./letters";
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { DEFAULT_POLICY, validatePolicy, type RewardPolicyConfig } from "./config";
import type { SchemeConfig, Tier } from "./engine";
import { mergePolicy, requireRewardHr, rewardAudit } from "./context";

const num = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : fallback;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

// ---- Policy: always saved as a NEW version; used versions are read-only ----
export async function savePolicy(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { data: latest } = await supabase.from("reward_policies").select("version, config").eq("org_id", orgId).order("version", { ascending: false }).limit(1).maybeSingle();
    const base: RewardPolicyConfig = mergePolicy(latest?.config as Partial<RewardPolicyConfig> | undefined);

    const config: RewardPolicyConfig = {
      ...base,
      scoreWeights: {
        kpi: num(formData.get("w_kpi"), base.scoreWeights.kpi),
        goals: num(formData.get("w_goals"), base.scoreWeights.goals),
        competencies: num(formData.get("w_competencies"), base.scoreWeights.competencies),
        values: num(formData.get("w_values"), base.scoreWeights.values),
        manager: num(formData.get("w_manager"), base.scoreWeights.manager),
      },
      bands: base.bands.map((b, i) => ({ ...b, min: num(formData.get(`band_${i}_min`), b.min), factor: num(formData.get(`band_${i}_factor`), b.factor) })),
      rangeCutoffs: { belowUnder: num(formData.get("cut_below"), base.rangeCutoffs.belowUnder), aboveOver: num(formData.get("cut_above"), base.rangeCutoffs.aboveOver) },
      meritMatrix: Object.fromEntries(
        base.bands.map((b, i) => [
          b.rating,
          Object.fromEntries(
            (["below", "mid", "above"] as const).map((pos) => [
              pos,
              { min: num(formData.get(`m_${i}_${pos}_min`), base.meritMatrix[b.rating][pos].min), max: num(formData.get(`m_${i}_${pos}_max`), base.meritMatrix[b.rating][pos].max) },
            ])
          ),
        ])
      ) as RewardPolicyConfig["meritMatrix"],
      eligibility: {
        ...base.eligibility,
        minScorePct: num(formData.get("min_score"), base.eligibility.minScorePct),
        minServiceMonths: num(formData.get("min_service"), base.eligibility.minServiceMonths),
        requireConfirmed: formData.get("require_confirmed") === "on",
        blockOnOpenDiscipline: formData.get("block_discipline") === "on",
      },
      bonus: {
        defaultTargetPct: num(formData.get("bonus_target"), base.bonus.defaultTargetPct),
        capPctOfTarget: num(formData.get("bonus_cap"), base.bonus.capPctOfTarget),
        discretionPct: num(formData.get("bonus_discretion"), base.bonus.discretionPct),
      },
      merit: { allowAboveBandMax: formData.get("allow_above_max") === "on" },
      roundingDecimals: Math.max(0, Math.min(2, Math.round(num(formData.get("rounding"), base.roundingDecimals)))),
    };
    const problem = validatePolicy(config);
    if (problem) throw new Error(problem);

    const version = (latest?.version ?? 0) + 1;
    const name = str(formData.get("name")) || `Policy v${version}`;
    const { data: row, error } = await supabase.from("reward_policies").insert({ org_id: orgId, version, name, config, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "policy.created", recordType: "reward_policy", recordId: row.id, before: latest ? { version: latest.version } : null, after: { version } });
    revalidatePath("/dashboard/rewards/policy");
  });
}

export async function createDefaultPolicy(_prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { count } = await supabase.from("reward_policies").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if ((count ?? 0) > 0) throw new Error("A policy already exists.");
    const { data: row, error } = await supabase.from("reward_policies").insert({ org_id: orgId, version: 1, name: "Default policy v1", config: DEFAULT_POLICY, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "policy.created", recordType: "reward_policy", recordId: row.id, after: { version: 1 } });
    revalidatePath("/dashboard/rewards");
    revalidatePath("/dashboard/rewards/policy");
  });
}

// ---- Cycles ----
export async function createRewardCycle(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const name = str(formData.get("name"));
    const start = str(formData.get("period_start"));
    const end = str(formData.get("period_end"));
    const effective = str(formData.get("effective_date"));
    const perfCycle = str(formData.get("performance_cycle"));
    const policyId = str(formData.get("policy_id"));
    if (!name || !start || !end || !effective) throw new Error("Give the cycle a name, review period and effective date.");
    if (end < start) throw new Error("The period must end after it starts.");
    if (!perfCycle) throw new Error("Choose the performance review cycle this reward cycle reads from.");
    if (!policyId) throw new Error("Create a reward policy first, then choose it here.");
    const { data: row, error } = await supabase
      .from("reward_cycles")
      .insert({ org_id: orgId, name, period_start: start, period_end: end, effective_date: effective, performance_cycle: perfCycle, policy_id: policyId, company_factor: num(formData.get("company_factor"), 1), created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "cycle.created", recordType: "reward_cycle", recordId: row.id, after: { name, start, end, effective, perfCycle } });
    revalidatePath("/dashboard/rewards");
  });
}

const ORDER = ["Planning", "Open", "Calibration", "Approval", "Finalised"];

export async function advanceCycle(cycleId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { data: cycle } = await supabase.from("reward_cycles").select("id, status").eq("id", cycleId).eq("org_id", orgId).maybeSingle();
    if (!cycle) throw new Error("Cycle not found.");
    const next = ORDER[ORDER.indexOf(cycle.status as string) + 1];
    if (!next) throw new Error("This cycle is already finalised.");
    if (next === "Finalised") {
      const { count } = await supabase
        .from("reward_recommendations")
        .select("id", { count: "exact", head: true })
        .eq("cycle_id", cycleId)
        .in("status", ["Open", "In Review", "Calibration"]);
      if ((count ?? 0) > 0) throw new Error(`${count} recommendation(s) are still waiting for a decision.`);
    }
    await supabase.from("reward_cycles").update({ status: next }).eq("id", cycleId);
    if (next === "Finalised") await notifyRewards(supabase, { orgId, userIds: await hrUserIds(supabase, orgId), type: "REWARD_CYCLE_FINALISED", category: "payroll", title: "A reward cycle was finalised", message: "Approved earnings will be picked up by the next payroll run.", entityType: "reward_cycle", entityId: cycleId, actionUrl: `/dashboard/rewards/cycles/${cycleId}` });
    if (next === "Open") {
      const { data: mgrs } = await supabase.from("app_users").select("id").eq("org_id", orgId).eq("role", "manager");
      await notifyRewards(supabase, { orgId, userIds: (mgrs ?? []).map((m) => m.id as string), type: "REWARD_CYCLE_OPENED", title: "A reward cycle is open", message: "Review your team's recommendations and submit them.", entityType: "reward_cycle", entityId: cycleId, actionUrl: `/dashboard/rewards/cycles/${cycleId}` });
    }
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "cycle.status", recordType: "reward_cycle", recordId: cycleId, before: { status: cycle.status }, after: { status: next } });
    revalidatePath(`/dashboard/rewards/cycles/${cycleId}`);
    revalidatePath("/dashboard/rewards");
  });
}

// ---- Pools ----
export async function createPool(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const name = str(formData.get("name"));
    const type = str(formData.get("pool_type"));
    const budget = num(formData.get("approved_budget"), -1);
    if (!name) throw new Error("Name the pool.");
    if (!["merit", "bonus", "incentive", "spot"].includes(type)) throw new Error("Choose a pool type.");
    if (budget < 0) throw new Error("Enter the approved budget in KES.");
    const cycleId = str(formData.get("cycle_id")) || null;
    const { data: row, error } = await supabase
      .from("reward_pools")
      .insert({ org_id: orgId, cycle_id: cycleId, name, pool_type: type, department: str(formData.get("department")) || null, approved_budget: budget, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "pool.created", recordType: "reward_pool", recordId: row.id, after: { name, type, budget } });
    revalidatePath("/dashboard/rewards");
    if (cycleId) revalidatePath(`/dashboard/rewards/cycles/${cycleId}`);
  });
}

// Raising a pool is an audited, explicit action (it is what unblocks a
// budget overrun at final approval).
export async function raisePool(poolId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const budget = num(formData.get("approved_budget"), -1);
    const reason = str(formData.get("reason"));
    if (budget < 0) throw new Error("Enter the new budget.");
    if (reason.length < 5) throw new Error("Give a reason for changing the budget.");
    const { data: pool } = await supabase.from("reward_pools").select("approved_budget, cycle_id").eq("id", poolId).eq("org_id", orgId).maybeSingle();
    if (!pool) throw new Error("Pool not found.");
    await supabase.from("reward_pools").update({ approved_budget: budget }).eq("id", poolId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "pool.budget_changed", recordType: "reward_pool", recordId: poolId, before: { budget: pool.approved_budget }, after: { budget }, reason });
    revalidatePath("/dashboard/rewards");
    if (pool.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${pool.cycle_id}`);
  });
}

// ---- Schemes ----
function parseTiers(text: string): Tier[] {
  // One tier per line: "from-to:pct", e.g. "0-100000:2" and "100000-:5".
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)?\s*:\s*(\d+(?:\.\d+)?)$/);
      if (!m) throw new Error(`Tier "${l}" is not in the form from-to:percent (for example 0-100000:2).`);
      return { from: Number(m[1]), to: m[2] ? Number(m[2]) : null, pct: Number(m[3]) };
    });
}

export async function createScheme(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const name = str(formData.get("name"));
    const type = str(formData.get("scheme_type"));
    const payout = str(formData.get("payout")) as SchemeConfig["payout"];
    if (!name) throw new Error("Name the scheme.");
    if (!["sales", "project", "team", "retention", "referral", "long_service", "spot"].includes(type)) throw new Error("Choose a scheme type.");
    if (!["flat", "pct_of_salary", "pct_of_result", "tiered"].includes(payout)) throw new Error("Choose a payout rule.");

    const config: SchemeConfig = { payout };
    if (payout === "flat") config.amount = num(formData.get("amount"));
    if (payout === "pct_of_salary" || payout === "pct_of_result") config.pct = num(formData.get("pct"));
    if (payout === "tiered") {
      config.tiers = parseTiers(str(formData.get("tiers")));
      if (config.tiers.length === 0) throw new Error("Add at least one tier.");
    }
    if (payout === "flat" && !(config.amount && config.amount > 0)) throw new Error("Enter the flat amount.");
    if ((payout === "pct_of_salary" || payout === "pct_of_result") && !(config.pct && config.pct > 0)) throw new Error("Enter the percentage.");
    if (str(formData.get("threshold"))) config.threshold = num(formData.get("threshold"));
    config.cap = str(formData.get("cap")) ? num(formData.get("cap")) : null;
    config.floor = str(formData.get("floor")) ? num(formData.get("floor")) : null;
    if (config.cap != null && config.floor != null && config.floor > config.cap) throw new Error("The floor cannot be above the cap.");

    const departments = str(formData.get("departments"))
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const { data: row, error } = await supabase
      .from("reward_schemes")
      .insert({
        org_id: orgId,
        name,
        scheme_type: type,
        metric: str(formData.get("metric")) || null,
        period: str(formData.get("period")) || "monthly",
        config,
        eligible: { departments },
        pool_id: str(formData.get("pool_id")) || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "scheme.created", recordType: "reward_scheme", recordId: row.id, after: { name, type, config } });
    revalidatePath("/dashboard/rewards/schemes");
  });
}

export async function toggleScheme(schemeId: string, _prev: FormResult, _formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { data: s } = await supabase.from("reward_schemes").select("is_active").eq("id", schemeId).eq("org_id", orgId).maybeSingle();
    if (!s) throw new Error("Scheme not found.");
    await supabase.from("reward_schemes").update({ is_active: !s.is_active }).eq("id", schemeId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "scheme.toggled", recordType: "reward_scheme", recordId: schemeId, before: { active: s.is_active }, after: { active: !s.is_active } });
    revalidatePath("/dashboard/rewards/schemes");
  });
}

// ---- Actuals (the results incentives are paid on) ----
// Lines: "staff_no, metric value" — one per line, or one line from the form.
export async function addActuals(schemeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const period = str(formData.get("period"));
    if (!period) throw new Error("Enter the period these results are for, for example 2026-10.");
    const lines = str(formData.get("lines"))
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) throw new Error("Enter at least one line: staff number, then the result.");
    const rows: { staff: string; value: number }[] = lines.map((l) => {
      const parts = l.split(/[,\t]/).map((p) => p.trim());
      const value = Number(parts[1]?.replace(/[^0-9.\-]/g, ""));
      if (!parts[0] || !Number.isFinite(value)) throw new Error(`"${l}" should be: staff number, result.`);
      return { staff: parts[0], value };
    });
    const { data: emps } = await supabase.from("employees").select("id, staff_no").eq("org_id", orgId).in("staff_no", rows.map((r) => r.staff));
    const byStaff = new Map((emps ?? []).map((e) => [e.staff_no as string, e.id as string]));
    const missing = rows.filter((r) => !byStaff.has(r.staff)).map((r) => r.staff);
    if (missing.length > 0) throw new Error(`No employee found for staff number(s): ${missing.join(", ")}.`);
    const { error } = await supabase.from("scheme_actuals").upsert(
      rows.map((r) => ({ org_id: orgId, scheme_id: schemeId, employee_id: byStaff.get(r.staff), period, metric_value: r.value, source: lines.length > 1 ? "upload" : "manual", status: "pending", created_by: userId })),
      { onConflict: "scheme_id,employee_id,period" }
    );
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "actuals.added", recordType: "reward_scheme", recordId: schemeId, after: { period, rows: rows.length } });
    revalidatePath("/dashboard/rewards/schemes");
  });
}

// HR approves the results before the engine may use them (spec §6).
export async function approveActuals(schemeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const period = str(formData.get("period"));
    if (!period) throw new Error("Choose a period.");
    const { data, error } = await supabase
      .from("scheme_actuals")
      .update({ status: "approved", approved_by: userId })
      .eq("scheme_id", schemeId)
      .eq("org_id", orgId)
      .eq("period", period)
      .eq("status", "pending")
      .select("id");
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) throw new Error("There are no pending results for that period.");
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "actuals.approved", recordType: "reward_scheme", recordId: schemeId, after: { period, rows: data?.length } });
    revalidatePath("/dashboard/rewards/schemes");
  });
}
