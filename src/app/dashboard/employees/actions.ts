"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function createEmployee(formData: FormData) {
  const supabase = await createClient();

  const payload = {
    org_id: DEFAULT_ORG_ID,
    staff_no: String(formData.get("staff_no") || ""),
    name: String(formData.get("name") || ""),
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || "Permanent"),
    date_of_hire: String(formData.get("date_of_hire") || ""),
    basic: Number(formData.get("basic") || 0),
    house_allowance: Number(formData.get("house_allowance") || 0),
    transport_allowance: Number(formData.get("transport_allowance") || 0),
    other_allowance: Number(formData.get("other_allowance") || 0),
    kra_pin: String(formData.get("kra_pin") || "") || null,
    nssf_no: String(formData.get("nssf_no") || "") || null,
    shif_no: String(formData.get("shif_no") || "") || null,
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
  };

  const { error } = await supabase.from("employees").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employees");
}

export async function inviteToEss(employeeId: string, email: string, role: string) {
  // Creating the auth.users row and the matching app_users row requires the
  // service_role key (admin API) and isn't safe to do with the anon key from
  // the browser. This is a stub showing where that Server Action would call
  // supabase.auth.admin.inviteUserByEmail() with a service-role client.
  throw new Error(
    `Invite-to-ESS for ${email} (employee ${employeeId}, role ${role}) requires a service-role key — not yet wired up.`
  );
}
