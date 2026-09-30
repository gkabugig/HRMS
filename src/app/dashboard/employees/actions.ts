"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { defaultProbationEndDate } from "@/lib/compliance";
import { logEmployeeChanges } from "@/lib/audit";
import { recordJobHistoryChange, recordCompensationHistoryChange } from "@/lib/employees/history";

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

  const { data: created, error } = await supabase.from("employees").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  // Seed the first job/compensation history rows so the Employee 360
  // History views aren't empty from day one.
  await supabase.from("employee_job_history").insert({
    employee_id: created.id,
    effective_from: dateOfHire,
    department: payload.department,
    job_title: payload.job_title,
    employment_type: payload.employment_type,
    manager_id: payload.reporting_manager_id,
    reason: "Hired",
  });
  await supabase.from("employee_compensation_history").insert({
    employee_id: created.id,
    effective_from: dateOfHire,
    basic: payload.basic,
    house_allowance: payload.house_allowance,
    transport_allowance: payload.transport_allowance,
    other_allowance: payload.other_allowance,
    reason: "Hired",
  });

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
    .select(
      "staff_no, department, job_title, employment_type, date_of_hire, reporting_manager_id, branch_id, probation_end_date, contract_issued_on, basic, house_allowance, transport_allowance, other_allowance, kra_pin, nssf_no, shif_no, bank_name, bank_account_no, bank_branch_code"
    )
    .eq("id", employeeId)
    .single();

  const after: Record<string, string | number | null> = {
    staff_no: String(formData.get("staff_no") || ""),
    department: String(formData.get("department") || ""),
    job_title: String(formData.get("job_title") || ""),
    employment_type: String(formData.get("employment_type") || ""),
    date_of_hire: String(formData.get("date_of_hire") || "") || null,
    reporting_manager_id: String(formData.get("reporting_manager_id") || "") || null,
    branch_id: String(formData.get("branch_id") || "") || null,
    probation_end_date: String(formData.get("probation_end_date") || "") || null,
    contract_issued_on: String(formData.get("contract_issued_on") || "") || null,
    basic: Number(formData.get("basic") || 0),
    house_allowance: Number(formData.get("house_allowance") || 0),
    transport_allowance: Number(formData.get("transport_allowance") || 0),
    other_allowance: Number(formData.get("other_allowance") || 0),
    kra_pin: String(formData.get("kra_pin") || "") || null,
    nssf_no: String(formData.get("nssf_no") || "") || null,
    shif_no: String(formData.get("shif_no") || "") || null,
    bank_name: String(formData.get("bank_name") || "") || null,
    bank_account_no: String(formData.get("bank_account_no") || "") || null,
    bank_branch_code: String(formData.get("bank_branch_code") || "") || null,
  };

  const { error } = await supabase.from("employees").update(after).eq("id", employeeId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("That staff number is already in use by another employee.");
    }
    throw new Error(error.message);
  }

  if (before && user) {
    await logEmployeeChanges(supabase, employeeId, user.id, before as Record<string, unknown>, after);
    await recordJobHistoryChange(supabase, employeeId, before, after as typeof before);
    await recordCompensationHistoryChange(supabase, employeeId, user.id, before, after as typeof before);
  }

  revalidatePath("/dashboard/employees");
  revalidatePath("/dashboard/organogram");
  revalidatePath(`/dashboard/employees/${employeeId}`);
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
