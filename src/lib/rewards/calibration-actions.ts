"use server";

// Calibration sessions (spec §15): open for a cycle in Calibration, apply the
// changes agreed in the room (each with a reason), close to store the
// before/after distributions and move the cycle to Approval.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { adjustRecommendation } from "./review-actions";
import { requireRewardHr, rewardAudit, mergePolicy } from "./context";
import { loadCalRows } from "./calibration-data";
import { ratingDistribution } from "./calibration-engine";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

async function ratingOrder(db: Parameters<typeof rewardAudit>[0], policyId: string): Promise<string[]> {
  const { data } = await db.from("reward_policies").select("config").eq("id", policyId).maybeSingle();
  return [...mergePolicy(data?.config).bands].sort((a, b) => b.min - a.min).map((b) => b.rating);
}

export async function openCalibrationSession(cycleId: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { data: cycle } = await supabase.from("reward_cycles").select("id, status, policy_id").eq("id", cycleId).eq("org_id", orgId).maybeSingle();
    if (!cycle) throw new Error("Cycle not found.");
    if (cycle.status !== "Calibration") throw new Error("Move the cycle to Calibration first.");
    const rows = await loadCalRows(supabase, orgId, cycleId);
    const order = await ratingOrder(supabase, cycle.policy_id as string);
    const merit = rows.filter((r) => r.rewardType === "merit" && !r.excluded);
    const participants = [...new Set(merit.map((r) => r.managerName))];
    const { data: s, error } = await supabase.from("calibration_sessions").insert({ org_id: orgId, cycle_id: cycleId, participants, before_dist: ratingDistribution(merit, order), opened_by: userId }).select("id").single();
    if (error) throw new Error(error.message.includes("one_open") ? "A session is already open for this cycle." : error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "calibration.opened", recordType: "calibration_session", recordId: s.id });
    revalidatePath("/dashboard/rewards/calibration");
  });
}

// Apply an agreed change to one recommendation. A reason is always required.
export async function calibrateRecommendation(sessionId: string, recId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const reason = str(formData.get("reason"));
    if (reason.length < 10) throw new Error("Write the reason agreed in the session (at least 10 characters).");
    const { data: s } = await supabase.from("calibration_sessions").select("id, status, decisions, cycle_id").eq("id", sessionId).eq("org_id", orgId).maybeSingle();
    if (!s || s.status !== "Open") throw new Error("This calibration session is not open.");
    const { data: rec } = await supabase.from("reward_recommendations").select("id, cycle_id, reward_type, pct, recommended_amount, status, employee_id").eq("id", recId).eq("org_id", orgId).maybeSingle();
    if (!rec || rec.cycle_id !== s.cycle_id) throw new Error("That recommendation is not part of this cycle.");
    if (rec.status !== "Open" && rec.status !== "Draft") throw new Error("This one has already been submitted. Reopen it from its page first, then calibrate.");
    const fd = new FormData();
    fd.set("justification", `Calibration: ${reason}`);
    if (rec.reward_type === "merit") fd.set("pct", str(formData.get("value")));
    else fd.set("amount", str(formData.get("value")));
    const res = await adjustRecommendation(recId, {} as FormResult, fd);
    if (res.error) throw new Error(res.error);
    const decision = { recId, employeeId: rec.employee_id, type: rec.reward_type, before: rec.reward_type === "merit" ? rec.pct : rec.recommended_amount, after: Number(str(formData.get("value"))), reason, by: userId, at: new Date().toISOString() };
    await supabase.from("calibration_sessions").update({ decisions: [...((s.decisions as unknown[]) ?? []), decision] }).eq("id", sessionId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "calibration.change", recordType: "reward_recommendation", recordId: recId, before: { value: decision.before }, after: { value: decision.after }, reason });
    revalidatePath("/dashboard/rewards/calibration");
  });
}

export async function closeCalibrationSession(sessionId: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const { data: s } = await supabase.from("calibration_sessions").select("id, status, cycle_id").eq("id", sessionId).eq("org_id", orgId).maybeSingle();
    if (!s || s.status !== "Open") throw new Error("This calibration session is not open.");
    const { data: cycle } = await supabase.from("reward_cycles").select("id, status, policy_id").eq("id", s.cycle_id).maybeSingle();
    if (!cycle) throw new Error("Cycle not found.");
    const rows = await loadCalRows(supabase, orgId, cycle.id as string);
    const order = await ratingOrder(supabase, cycle.policy_id as string);
    const after = ratingDistribution(rows.filter((r) => r.rewardType === "merit" && !r.excluded), order);
    await supabase.from("calibration_sessions").update({ status: "Closed", after_dist: after, closed_by: userId, closed_at: new Date().toISOString() }).eq("id", sessionId);
    if (cycle.status === "Calibration") await supabase.from("reward_cycles").update({ status: "Approval" }).eq("id", cycle.id);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "calibration.closed", recordType: "calibration_session", recordId: sessionId, after: { cycleStatus: "Approval" } });
    revalidatePath("/dashboard/rewards/calibration");
    revalidatePath(`/dashboard/rewards/cycles/${cycle.id}`);
  });
}
