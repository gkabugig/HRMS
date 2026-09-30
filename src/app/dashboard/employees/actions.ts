"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { defaultProbationEndDate } from "@/lib/compliance";
import { logEmployeeChanges } from "@/lib/audit";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function createEmployee(formData: FormData) {
  const supabase = await createClient();

  const dateOfHire = String(formData.get("date_of_hire") || "");
  const probationEndDate =
    String(formData.get("probation_end_date") || "") || defaultProbationEndDate(dateOfHire);

  const payload = {
    org_id: DEFAULT_ORG_ID,
    staff_no: String(formData.get("staff_no") || ""),
    name: String(formData.get("name") || ""),
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || "Permanent"),
    date_of_hire: dateOfHire,
    basic: Number(formData.get("basic") || 0),
    house_allowance: Number(formData.get("house_allowance") || 0),
    transport_allowance: Number(formData.get("transport_allowance") || 0),
    other_allowance: Number(formData.get("other_allowance") || 0),
    kra_pin: String(formData.get("kra_pin") || "") || null,
    nssf_no: String(formData.get("nssf_no") || "") || null,
    shif_no: String(formData.get("shif_no") || "") || null,
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
    branch_id: String(formData.get("branch_id") || "") || null,
    probation_end_date: probationEndDate,
    contract_issued_on: String(formData.get("contract_issued_on") || "") || null,
  };

  const { error } = await supabase.from("employees").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/employees");
}

// Single edit form covering org structure (department, manager, branch) and
// the Section 9/10/42 compliance fields (probation, written contract) that
// are usually settled after the employee record already exists. Every
// changed field is written to employee_audit_log so there's a real history
// behind the Audit Log page, not just the latest snapshot.
export async function updateEmployee(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: before } = await supabase
    .from("employees")
    .select("department, job_title, employment_type, reporting_manager_id, branch_id, probation_end_date, contract_issued_on")
    .eq("id", employeeId)
    .single();

  const after: Record<string, string | null> = {
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || ""),
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
    branch_id: String(formData.get("branch_id") || "") || null,
    probation_end_date: String(formData.get("probation_end_date") || "") || null,
    contract_issued_on: String(formData.get("contract_issued_on") || "") || null,
  };

  const { error } = await supabase.from("employees").update(after).eq("id", employeeId);
  if (error) throw new Error(error.message);

  if (before && user) {
    await logEmployeeChanges(supabase, employeeId, user.id, before as Record<string, unknown>, after);
  }

  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/organogram");
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
