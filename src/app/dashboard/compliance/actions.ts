"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrgId } from "@/lib/auth/current-org";
import { revalidatePath } from "next/cache";


export async function recordFiling(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("statutory_filing_log").upsert(
    {
      org_id: await requireOrgId(supabase),
      filing_key: String(formData.get("filing_key")),
      period: String(formData.get("period")),
      filed_on: String(formData.get("filed_on") || new Date().toISOString().slice(0, 10)),
      filed_by: user!.id,
    },
    { onConflict: "org_id,filing_key,period" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compliance");
}

export async function addComplianceDocument(formData: FormData) {
  const supabase = await createClient();
  const employeeId = String(formData.get("employee_id") || "");

  const { error } = await supabase.from("compliance_documents").insert({
    org_id: await requireOrgId(supabase),
    employee_id: employeeId || null,
    doc_type: String(formData.get("doc_type")),
    label: String(formData.get("label")),
    expiry_date: String(formData.get("expiry_date")),
    alert_threshold_days: Number(formData.get("alert_threshold_days") || 30),
    notes: String(formData.get("notes") || "") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compliance");
}

export async function deleteComplianceDocument(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compliance");
}

export async function publishPolicy(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.from("policies").insert({
    org_id: await requireOrgId(supabase),
    name: String(formData.get("name")),
    version: String(formData.get("version") || "") || null,
    published_on: String(formData.get("published_on") || new Date().toISOString().slice(0, 10)),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compliance");
}

export async function acknowledgePolicy(policyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", user!.id)
    .maybeSingle();
  if (!appUser?.employee_id) throw new Error("No employee record linked to this account.");

  const { error } = await supabase.from("policy_acknowledgments").upsert(
    {
      policy_id: policyId,
      employee_id: appUser.employee_id,
    },
    { onConflict: "policy_id,employee_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/compliance");
}
