"use server";

// Area 16: simple HR/admin-managed reference and planning-support data —
// position types, position budgets, and what-if scenarios. None of these
// need an approval workflow of their own (they're configuration/analysis,
// not headcount decisions), so they're plain audited CRUD.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage this.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function createPositionType(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!code || !name) throw new Error("Code and name are required.");

  const { error } = await supabase.from("position_types").insert({
    org_id: orgId,
    code,
    name,
    description: String(formData.get("description") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/positions/establishment");
}

export async function setPositionBudget(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  const positionId = String(formData.get("position_id") || "");
  if (!positionId) throw new Error("Select a position.");

  const { error } = await supabase.from("position_budgets").insert({
    org_id: orgId,
    position_id: positionId,
    budget_period_start: String(formData.get("budget_period_start") || ""),
    budget_period_end: String(formData.get("budget_period_end") || ""),
    budgeted_amount: Number(formData.get("budgeted_amount") || 0),
    currency: String(formData.get("currency") || "KES"),
    cost_centre_id: String(formData.get("cost_centre_id") || "") || null,
  });
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "position_budget.set",
    resourceType: "position",
    resourceId: positionId,
    eventCategory: "configuration",
  });

  revalidatePath(`/dashboard/positions/${positionId}`);
}

export async function createWorkforceScenario(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Scenario name is required.");

  const { error } = await supabase.from("workforce_scenarios").insert({
    org_id: orgId,
    name,
    description: String(formData.get("description") || "") || null,
    base_plan_id: String(formData.get("base_plan_id") || "") || null,
    status: "draft",
    created_by: userId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/positions/scenarios");
}

export async function addScenarioLine(formData: FormData) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  const scenarioId = String(formData.get("scenario_id") || "");

  const { error } = await supabase.from("workforce_scenario_lines").insert({
    scenario_id: scenarioId,
    org_id: orgId,
    organisation_unit_id: String(formData.get("organisation_unit_id") || "") || null,
    position_type_id: String(formData.get("position_type_id") || "") || null,
    grade: String(formData.get("grade") || "") || null,
    headcount_delta: Number(formData.get("headcount_delta") || 0),
    cost_delta: formData.get("cost_delta") ? Number(formData.get("cost_delta")) : null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/positions/scenarios/${scenarioId}`);
}

export async function setScenarioStatus(scenarioId: string, status: "draft" | "active" | "archived") {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("workforce_scenarios").update({ status }).eq("id", scenarioId).eq("org_id", orgId);
  revalidatePath(`/dashboard/positions/scenarios/${scenarioId}`);
}
