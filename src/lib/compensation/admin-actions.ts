"use server";

// Area 17: reference data (grades/bands/components/plans) and budgets —
// HR/admin-managed configuration, no approval workflow of its own.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage compensation structures.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function createCompensationGrade(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!code || !name) throw new Error("Code and name are required.");

  const { error } = await supabase.from("compensation_grades").insert({
    org_id: orgId,
    code,
    name,
    description: String(formData.get("description") || "") || null,
    order_rank: Number(formData.get("order_rank") || 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compensation/grades");
}

export async function createCompensationBand(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const gradeId = String(formData.get("grade_id") || "");
  if (!gradeId) throw new Error("Select a grade.");

  const { error } = await supabase.from("compensation_bands").insert({
    org_id: orgId,
    grade_id: gradeId,
    currency: String(formData.get("currency") || "KES"),
    min_amount: Number(formData.get("min_amount") || 0),
    max_amount: Number(formData.get("max_amount") || 0),
    effective_from: String(formData.get("effective_from") || new Date().toISOString().slice(0, 10)),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compensation/grades");
}

export async function createCompensationComponent(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const componentType = String(formData.get("component_type") || "");
  if (!code || !name) throw new Error("Code and name are required.");
  if (!["basic", "allowance", "benefit", "deduction"].includes(componentType)) throw new Error("Invalid component type.");

  const { error } = await supabase.from("compensation_components").insert({
    org_id: orgId,
    code,
    name,
    component_type: componentType,
    is_taxable: formData.get("is_taxable") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compensation/components");
}

export async function createCompensationPlan(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Plan name is required.");

  const { error } = await supabase.from("compensation_plans").insert({
    org_id: orgId,
    name,
    description: String(formData.get("description") || "") || null,
    grade_id: String(formData.get("grade_id") || "") || null,
    default_basic: formData.get("default_basic") ? Number(formData.get("default_basic")) : null,
    default_house_allowance: formData.get("default_house_allowance") ? Number(formData.get("default_house_allowance")) : null,
    default_transport_allowance: formData.get("default_transport_allowance") ? Number(formData.get("default_transport_allowance")) : null,
    default_other_allowance: formData.get("default_other_allowance") ? Number(formData.get("default_other_allowance")) : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compensation/plans");
}

export async function createCompensationBudget(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);

  const { error } = await supabase.from("compensation_budgets").insert({
    org_id: orgId,
    organisation_unit_id: String(formData.get("organisation_unit_id") || "") || null,
    budget_period_start: String(formData.get("budget_period_start") || ""),
    budget_period_end: String(formData.get("budget_period_end") || ""),
    budgeted_amount: Number(formData.get("budgeted_amount") || 0),
    currency: String(formData.get("currency") || "KES"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compensation/budgets");
}
