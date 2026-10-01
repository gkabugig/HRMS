"use server";

// Area 06 §11 "Performance Workspace" — manager 1:1 / check-in notes.
// manager_checkins (migration 0073) has its own RLS
// (manager_checkins_manager_insert: manager_id = current_employee_id() and
// is_manager_of(employee_id)) so this relies on that as the authorization
// boundary, same as every other manager write in this area — the app layer
// re-validates scope via requireManagerContext + getManagerScope before
// rendering the form, but the database is what actually enforces it.
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireManagerContext } from "./require-manager-context";

export async function submitManagerCheckIn(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const ctx = await requireManagerContext(supabase);

  const notes = String(formData.get("notes") || "").trim();
  if (!notes) throw new Error("Notes are required.");
  const agreedActions = String(formData.get("agreed_actions") || "").trim() || null;

  const { error } = await supabase.from("manager_checkins").insert({
    org_id: ctx.orgId,
    employee_id: employeeId,
    manager_id: ctx.employeeId,
    notes,
    agreed_actions: agreedActions,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/manager/team/${employeeId}`);
}
