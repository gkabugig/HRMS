"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

async function currentAppUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();
  return data;
}

export async function createCourse(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").insert({
    org_id: DEFAULT_ORG_ID,
    name: String(formData.get("name")),
    provider: String(formData.get("provider") || "") || null,
    mode: String(formData.get("mode") || "") || null,
    duration: String(formData.get("duration") || "") || null,
    cost: Number(formData.get("cost") || 0),
    mandatory: formData.get("mandatory") === "on",
    validity_months: formData.get("validity_months")
      ? Number(formData.get("validity_months"))
      : null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ld");
}

export async function updateCourse(courseId: string, formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Course name is required.");

  const { error } = await supabase
    .from("training_courses")
    .update({
      name,
      provider: String(formData.get("provider") || "") || null,
      mode: String(formData.get("mode") || "") || null,
      duration: String(formData.get("duration") || "") || null,
      cost: Number(formData.get("cost") || 0),
      mandatory: formData.get("mandatory") === "on",
      validity_months: formData.get("validity_months")
        ? Number(formData.get("validity_months"))
        : null,
    })
    .eq("id", courseId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ld");
}

export async function deleteCourse(courseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").delete().eq("id", courseId);
  if (error) {
    // Most likely a foreign-key violation from existing enrollments
    // (training_enrollments.course_id has no ON DELETE CASCADE) - give a
    // clearer message than the raw Postgres error.
    if (error.code === "23503") {
      throw new Error("Can't delete this course - employees are still enrolled in it.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/ld");
}

export async function enrollSelf(courseId: string) {
  const user = await currentAppUser();
  if (!user?.employee_id) throw new Error("No employee record linked to this account.");

  const supabase = await createClient();
  const { error } = await supabase.from("training_enrollments").insert({
    employee_id: user.employee_id,
    course_id: courseId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ld");
}

export async function enrollEmployee(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("training_enrollments").insert({
    employee_id: String(formData.get("employee_id")),
    course_id: String(formData.get("course_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ld");
}

export async function markEnrollmentComplete(enrollmentId: string, formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_enrollments")
    .update({
      status: "Completed",
      completed_on: String(formData.get("completed_on") || new Date().toISOString().slice(0, 10)),
      certificate_note: String(formData.get("certificate_note") || "") || null,
    })
    .eq("id", enrollmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ld");
}
