"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ASSIGNMENT_TYPES = ["Task", "Asset"] as const;
const ASSIGNMENT_STATUSES = ["Open", "In Progress", "Completed"] as const;

export async function createAssignment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const employeeId = String(formData.get("employee_id") || "");
  const type = String(formData.get("type") || "Task");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const dueDate = String(formData.get("due_date") || "");

  if (!employeeId) throw new Error("Choose an employee.");
  if (!title) throw new Error("Title is required.");
  if (!ASSIGNMENT_TYPES.includes(type as (typeof ASSIGNMENT_TYPES)[number])) {
    throw new Error("Invalid assignment type.");
  }

  const { error } = await supabase.from("assignments").insert({
    employee_id: employeeId,
    type,
    title,
    description: description || null,
    due_date: dueDate || null,
    assigned_by: user!.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assignments");
}

export async function updateAssignmentStatus(assignmentId: string, status: string) {
  const supabase = await createClient();
  if (!ASSIGNMENT_STATUSES.includes(status as (typeof ASSIGNMENT_STATUSES)[number])) {
    throw new Error("Invalid status.");
  }
  const { error } = await supabase
    .from("assignments")
    .update({
      status,
      completed_at: status === "Completed" ? new Date().toISOString() : null,
    })
    .eq("id", assignmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assignments");
}

export async function deleteAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/assignments");
}
