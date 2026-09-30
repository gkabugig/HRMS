"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function updateRates(formData: FormData) {
  const supabase = await createClient();

  const payload = {
    org_id: DEFAULT_ORG_ID,
    effective_from: new Date().toISOString().slice(0, 10),
    paye_bands: JSON.parse(String(formData.get("paye_bands"))),
    personal_relief: Number(formData.get("personal_relief")),
    nssf_tier1_ceiling: Number(formData.get("nssf_tier1_ceiling")),
    nssf_tier2_ceiling: Number(formData.get("nssf_tier2_ceiling")),
    nssf_rate: Number(formData.get("nssf_rate")),
    shif_rate: Number(formData.get("shif_rate")),
    shif_min: Number(formData.get("shif_min")),
    housing_levy_rate: Number(formData.get("housing_levy_rate")),
  };

  const { error } = await supabase
    .from("statutory_rates")
    .upsert(payload, { onConflict: "org_id,effective_from" });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}

// Toggle a single role/module cell in the Roles & Permissions matrix. This
// is a UI-visibility layer only (see 0014_role_module_permissions.sql) — it
// hides/shows a nav item for that role, it does not change what the
// underlying RLS policies allow that role to read or write.
export async function toggleModulePermission(formData: FormData) {
  const supabase = await createClient();
  const role = String(formData.get("role") || "");
  const moduleKey = String(formData.get("module_key") || "");
  const canView = formData.get("can_view") === "true";
  if (!role || !moduleKey) throw new Error("Missing role or module.");

  const { error } = await supabase.from("role_module_permissions").upsert(
    { org_id: DEFAULT_ORG_ID, role, module_key: moduleKey, can_view: canView },
    { onConflict: "org_id,role,module_key" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}
