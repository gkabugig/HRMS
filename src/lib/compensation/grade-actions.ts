"use server";

// Grade classification (not a pay change): which grade each employee is on,
// and each grade's bonus target. HR/admin only; every change is logged.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createClient } from "@/lib/supabase/server";

async function requireHr() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role, employee_id").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role as string)) throw new Error("Only HR or an administrator can do this.");
  return { supabase, userId: user.id, orgId: appUser.org_id as string, ownEmployeeId: (appUser.employee_id as string | null) ?? null };
}

export async function setGradeBonusTarget(gradeId: string, _prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId } = await requireHr();
    const raw = String(formData.get("bonus_target_pct") ?? "").trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) throw new Error("Enter a percentage between 0 and 100, or leave blank to use the policy default.");
    const { error } = await supabase.from("compensation_grades").update({ bonus_target_pct: value }).eq("id", gradeId).eq("org_id", orgId);
    if (error) throw new Error(error.message);
    await supabase.from("compensation_events").insert({ org_id: orgId, entity_type: "compensation_grade", entity_id: gradeId, event_type: "bonus_target_set", actor_user_id: userId, details: { bonus_target_pct: value } });
    revalidatePath("/dashboard/compensation/grades");
  });
}

// Puts employees on grades in one go. Pay is not touched: the open compensation
// history row simply records the grade (or a first row is created from current pay).
export async function assignGrades(_prev: FormResult, formData: FormData): Promise<FormResult> {
  return toResult(async () => {
    const { supabase, userId, orgId, ownEmployeeId } = await requireHr();
    const changes: { employeeId: string; gradeId: string }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("grade_")) continue;
      const employeeId = key.slice(6);
      const gradeId = String(value).trim();
      const before = String(formData.get(`orig_${employeeId}`) ?? "");
      if (gradeId && gradeId !== before) changes.push({ employeeId, gradeId });
    }
    if (changes.length === 0) throw new Error("Choose a grade for at least one employee first.");
    if (ownEmployeeId && changes.some((c) => c.employeeId === ownEmployeeId)) throw new Error("You cannot set your own grade. Ask another HR user or an administrator.");

    const { data: grades } = await supabase.from("compensation_grades").select("id").eq("org_id", orgId);
    const valid = new Set((grades ?? []).map((g) => g.id as string));
    const { data: emps } = await supabase.from("employees").select("id, basic, house_allowance, transport_allowance, other_allowance, date_of_hire").eq("org_id", orgId).in("id", changes.map((c) => c.employeeId));
    const empMap = new Map((emps ?? []).map((e) => [e.id as string, e]));

    let done = 0;
    for (const c of changes) {
      const emp = empMap.get(c.employeeId);
      if (!emp || !valid.has(c.gradeId)) continue;
      const { data: open } = await supabase.from("employee_compensation_history").select("id, grade_id").eq("employee_id", c.employeeId).is("effective_to", null).maybeSingle();
      if (open) {
        const { error } = await supabase.from("employee_compensation_history").update({ grade_id: c.gradeId }).eq("id", open.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("employee_compensation_history").insert({ employee_id: c.employeeId, effective_from: emp.date_of_hire, basic: emp.basic, house_allowance: emp.house_allowance, transport_allowance: emp.transport_allowance, other_allowance: emp.other_allowance, reason: "Grade assigned", approved_by: userId, grade_id: c.gradeId });
        if (error) throw new Error(error.message);
      }
      await supabase.from("compensation_events").insert({ org_id: orgId, entity_type: "employee_grade", entity_id: c.employeeId, event_type: "grade_assigned", actor_user_id: userId, details: { from: open?.grade_id ?? null, to: c.gradeId } });
      done++;
    }
    revalidatePath("/dashboard/compensation/assign-grades");
    revalidatePath("/dashboard/rewards");
    if (done === 0) throw new Error("Nothing was saved. Check the grades chosen.");
  });
}
