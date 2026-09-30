"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function createBranch(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    org_id: DEFAULT_ORG_ID,
    name: String(formData.get("name") || ""),
    location: String(formData.get("location") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/employees");
}

export async function deleteBranch(branchId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("branches").delete().eq("id", branchId);
  if (error) {
    if (error.code === "23503") {
      throw new Error("Can't delete a branch that still has employees assigned to it — reassign them first.");
    }
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/branches");
  revalidatePath("/dashboard/employees");
}
