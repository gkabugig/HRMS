"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

function optionalNumber(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createBranch(formData: FormData) {
  const supabase = await createClient();
  const latitude = optionalNumber(formData.get("latitude"));
  const longitude = optionalNumber(formData.get("longitude"));
  if ((latitude === null) !== (longitude === null)) throw new Error("Enter both latitude and longitude, or leave both blank.");
  if (latitude !== null && (Math.abs(latitude) > 90 || Math.abs(longitude as number) > 180)) {
    throw new Error("Latitude must be between -90 and 90, and longitude between -180 and 180.");
  }
  const radius = optionalNumber(formData.get("geofence_radius_m"));
  const { error } = await supabase.from("branches").insert({
    org_id: DEFAULT_ORG_ID,
    name: String(formData.get("name") || ""),
    location: String(formData.get("location") || "") || null,
    latitude,
    longitude,
    ...(radius && radius > 0 ? { geofence_radius_m: Math.round(radius) } : {}),
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
