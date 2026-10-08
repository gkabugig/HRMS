"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { requireHrCtx, str } from "./context";

const LEVELS = ["high", "medium", "low"];
const READINESS = ["ready_now", "one_to_two_years", "three_plus_years"];

export async function addSuccessionPlan(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const roleTitle = str(formData.get("role_title"));
    const incumbent = str(formData.get("incumbent_id")) || null;
    const criticality = str(formData.get("criticality"));
    const risk = str(formData.get("vacancy_risk"));
    if (!roleTitle) throw new Error("Name the role.");
    if (!LEVELS.includes(criticality) || !LEVELS.includes(risk)) throw new Error("Choose how critical the role is and how likely it is to fall vacant.");
    if (incumbent) {
      const { data: e } = await c.supabase.from("employees").select("id").eq("id", incumbent).eq("org_id", c.orgId).maybeSingle();
      if (!e) throw new Error("That employee was not found.");
    }
    const { error } = await c.supabase.from("succession_plans").insert({ org_id: c.orgId, role_title: roleTitle, incumbent_id: incumbent, criticality, vacancy_risk: risk, notes: str(formData.get("notes")) || null, created_by: c.userId });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/succession");
  });
}

export async function removeSuccessionPlan(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("succession_plans").delete().eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/succession");
  });
}

export async function addSuccessor(planId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const employeeId = str(formData.get("employee_id"));
    const readiness = str(formData.get("readiness"));
    if (!employeeId) throw new Error("Choose the successor.");
    if (!READINESS.includes(readiness)) throw new Error("Choose how soon they could step up.");
    const { data: plan } = await c.supabase.from("succession_plans").select("id, incumbent_id").eq("id", planId).eq("org_id", c.orgId).maybeSingle();
    if (!plan) throw new Error("Plan not found.");
    if (plan.incumbent_id === employeeId) throw new Error("The current holder can't be their own successor.");
    const { data: e } = await c.supabase.from("employees").select("id").eq("id", employeeId).eq("org_id", c.orgId).maybeSingle();
    if (!e) throw new Error("That employee was not found.");
    const { error } = await c.supabase.from("succession_candidates").insert({ plan_id: planId, employee_id: employeeId, readiness, development_notes: str(formData.get("development_notes")) || null });
    if (error) throw new Error(error.code === "23505" ? "They are already a successor for this role." : error.message);
    revalidatePath("/dashboard/succession");
  });
}

export async function removeSuccessor(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("succession_candidates").delete().eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/succession");
  });
}
