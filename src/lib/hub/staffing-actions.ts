"use server";

import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { requireHrCtx, str } from "./context";

export async function addStaffingRule(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const jobTitle = str(formData.get("job_title"));
    const min = Number(str(formData.get("min_count")));
    const branchId = str(formData.get("branch_id")) || null;
    if (!jobTitle) throw new Error("Enter the job title this rule is about.");
    if (!Number.isInteger(min) || min < 1) throw new Error("The minimum must be a whole number of 1 or more.");
    if (branchId) {
      const { data: b } = await c.supabase.from("branches").select("id").eq("id", branchId).eq("org_id", c.orgId).maybeSingle();
      if (!b) throw new Error("Branch not found.");
    }
    const { error } = await c.supabase.from("branch_staffing_rules").insert({ org_id: c.orgId, branch_id: branchId, job_title: jobTitle, min_count: min });
    if (error) throw new Error(error.code === "23505" ? "That rule already exists." : error.message);
    revalidatePath("/dashboard/branches/staffing");
  });
}

export async function removeStaffingRule(id: string, _prev: FormResult, _fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const { error } = await c.supabase.from("branch_staffing_rules").delete().eq("id", id).eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/branches/staffing");
  });
}
