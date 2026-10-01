"use server";

// Area 16 §7.8: vacancy lifecycle (OPEN -> ON_HOLD -> FILLED/CANCELLED),
// distinct from positions.status='vacant' (occupancy only — see migration
// 0106's header comment). HR/admin-managed; no approval workflow of its own
// per spec (the headcount decision already happened when the position was
// approved/created — opening a vacancy just starts recruitment demand
// tracking, optionally against an existing requisition).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can manage vacancies.");
  return { userId: user.id, orgId: appUser.org_id as string, role: appUser.role as string };
}

export async function openVacancy(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const positionId = String(formData.get("position_id") || "");
  if (!positionId) throw new Error("Select a position.");
  const { data: position } = await supabase.from("positions").select("id, status").eq("id", positionId).eq("org_id", orgId).maybeSingle();
  if (!position) throw new Error("Position not found.");

  const { data, error } = await supabase
    .from("vacancies")
    .insert({
      org_id: orgId,
      position_id: positionId,
      requisition_id: String(formData.get("requisition_id") || "") || null,
      status: "open",
      target_fill_date: String(formData.get("target_fill_date") || "") || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("position_events").insert({
    position_id: positionId,
    org_id: orgId,
    event_type: "vacancy_opened",
    actor_user_id: userId,
    details: { vacancyId: data.id },
  });

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "vacancy.opened",
    resourceType: "vacancy",
    resourceId: data.id,
    eventCategory: "workflow",
  });

  revalidatePath("/dashboard/positions/vacancies");
}

export async function updateVacancyStatus(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);

  const vacancyId = String(formData.get("vacancy_id") || "");
  const status = String(formData.get("status") || "");
  if (!["open", "on_hold", "filled", "cancelled"].includes(status)) throw new Error("Invalid status.");

  const { data: vacancy } = await supabase.from("vacancies").select("id, position_id, org_id").eq("id", vacancyId).eq("org_id", orgId).maybeSingle();
  if (!vacancy) throw new Error("Vacancy not found.");

  const update: Record<string, unknown> = { status };
  if (status === "filled") {
    update.filled_at = new Date().toISOString();
    update.filled_by_employee_id = String(formData.get("filled_by_employee_id") || "") || null;
    // Occupancy flips to 'occupied' once the vacancy is actually filled —
    // the existing concept positions.status already governs occupancy.
    await supabase.from("positions").update({ status: "occupied" }).eq("id", vacancy.position_id);
  }
  if (status === "cancelled") {
    update.cancelled_reason = String(formData.get("cancelled_reason") || "") || null;
  }

  const { error } = await supabase.from("vacancies").update(update).eq("id", vacancyId);
  if (error) throw new Error(error.message);

  await supabase.from("position_events").insert({
    position_id: vacancy.position_id,
    org_id: orgId,
    event_type: `vacancy_${status}`,
    actor_user_id: userId,
    details: { vacancyId },
  });

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: `vacancy.${status}`,
    resourceType: "vacancy",
    resourceId: vacancyId,
    eventCategory: "workflow",
  });

  revalidatePath("/dashboard/positions/vacancies");
}
