"use server";

// Configurable approval chains and amendments (spec §12).
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { requireRewardHr, rewardAudit } from "./context";
import type { Stage } from "./approval-chain";

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const STAGES: Stage[] = ["hr", "admin", "head"];

export async function saveWorkflow(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    const name = str(formData.get("name"));
    if (!name) throw new Error("Name the chain.");
    const stages = [1, 2, 3].map((n) => str(formData.get(`stage_${n}`))).filter(Boolean) as Stage[];
    if (stages.length === 0) throw new Error("Choose at least one approval stage.");
    if (stages.some((s) => !STAGES.includes(s))) throw new Error("Unknown approval stage.");
    const min = Number(str(formData.get("min_amount")) || 0);
    const maxRaw = str(formData.get("max_amount"));
    const max = maxRaw === "" ? null : Number(maxRaw);
    if (!Number.isFinite(min) || min < 0) throw new Error("The minimum amount must be zero or more.");
    if (max !== null && (!Number.isFinite(max) || max < min)) throw new Error("The maximum must be at least the minimum.");
    const due = Math.round(Number(str(formData.get("due_days")) || 3));
    if (!(due >= 1 && due <= 60)) throw new Error("Escalation days must be between 1 and 60.");
    const row = { org_id: orgId, name, reward_type: str(formData.get("reward_type")) || "*", min_amount: min, max_amount: max, exceptions_only: formData.get("exceptions_only") === "on", stages, due_days: due, created_by: userId };
    const { data, error } = await supabase.from("reward_approval_workflows").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "approval_workflow.created", recordType: "reward_approval_workflow", recordId: data.id, after: row });
    revalidatePath("/dashboard/rewards/approvals");
  });
}

export async function removeWorkflow(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireRewardHr();
    await supabase.from("reward_approval_workflows").update({ is_active: false }).eq("id", id).eq("org_id", orgId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "approval_workflow.removed", recordType: "reward_approval_workflow", recordId: id });
    revalidatePath("/dashboard/rewards/approvals");
  });
}

// A change after approval reopens only that record, keeps the earlier version,
// and goes through approval again. Allowed only while nothing has reached pay:
// earnings not yet in a pay run, or a salary change still scheduled.
export async function amendRecommendation(recId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId, employeeId } = await requireRewardHr();
    const reason = str(formData.get("reason"));
    if (reason.length < 10) throw new Error("Write why this is being amended (at least 10 characters).");
    const { data: rec } = await supabase.from("reward_recommendations").select("*").eq("id", recId).eq("org_id", orgId).maybeSingle();
    if (!rec) throw new Error("Recommendation not found.");
    if (employeeId && rec.employee_id === employeeId) throw new Error("You cannot amend your own reward.");
    if (rec.status !== "Finalised") throw new Error("Only an approved reward can be amended.");
    const { data: tx } = await supabase.from("reward_transactions").select("id, payroll_status, change_request_id, tx_type").eq("recommendation_id", recId).maybeSingle();
    if (!tx) throw new Error("No posted outcome found to amend.");
    if (tx.payroll_status !== "pending") throw new Error("This has already gone into a pay run, so it can no longer be amended here.");
    if (tx.tx_type === "salary_change") {
      const { data: cr } = await supabase.from("compensation_change_requests").select("status").eq("id", tx.change_request_id).maybeSingle();
      if (cr?.status !== "scheduled") throw new Error("This salary change has already taken effect. Raise a compensation change instead.");
      await supabase.from("compensation_change_requests").update({ status: "cancelled" }).eq("id", tx.change_request_id);
    }
    const version = Number(rec.version ?? 1);
    const { error: vErr } = await supabase.from("reward_recommendation_versions").insert({ org_id: orgId, recommendation_id: recId, version, row_json: rec, reason, amended_by: userId });
    if (vErr) throw new Error(vErr.message);
    await supabase.from("reward_transactions").delete().eq("id", tx.id);
    await supabase.from("reward_recommendations").update({ status: "Open", approval_request_id: null, version: version + 1 }).eq("id", recId);
    await rewardAudit(supabase, { orgId, actorUserId: userId, event: "recommendation.amended", recordType: "reward_recommendation", recordId: recId, before: { version, status: "Finalised" }, after: { version: version + 1, status: "Open" }, reason });
    revalidatePath(`/dashboard/rewards/recommendations/${recId}`);
    if (rec.cycle_id) revalidatePath(`/dashboard/rewards/cycles/${rec.cycle_id}`);
  });
}
