"use server";

// Area 08 §22 Controlled Document Generation. Plain {{variable}}
// substitution only — the substitution function below does a single
// regex replace against a fixed lookup map; it never evaluates the
// template body as code, and the variable values are either resolved
// here from already-authorized server-side employee/org data, or typed
// in by the HR user creating the document (who is already authorized to
// issue it — same trust boundary as uploadDocument). The generated output
// is never handed back as a download: it's turned into a File and pushed
// through the exact same createDocument() lifecycle path as any uploaded
// document, so it is still subject to the same approval/issue rules,
// versioning, and audit trail (spec §22: "generated output becomes a
// governed version").
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "./lifecycle";
import { substituteTemplate, type TemplateVariableMap } from "./template-engine";

async function resolveEmployeeVariables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string
): Promise<TemplateVariableMap> {
  const { data: employee } = await supabase
    .from("employees")
    .select("name, staff_no, department, job_title, date_of_hire, organizations(name)")
    .eq("id", employeeId)
    .maybeSingle();
  const org = employee?.organizations as unknown as { name: string } | { name: string }[] | null;
  const orgName = Array.isArray(org) ? org[0]?.name : org?.name;
  return {
    employee_name: employee?.name ?? "",
    staff_no: employee?.staff_no ?? "",
    department: employee?.department ?? "",
    job_title: employee?.job_title ?? "",
    start_date: employee?.date_of_hire ?? "",
    organisation_name: orgName ?? "",
    today: new Date().toISOString().slice(0, 10),
  };
}

export async function listDocumentTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("id, code, name, document_type_id, version, is_active, document_types(name)")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function generateDocumentFromTemplate(input: {
  templateId: string;
  employeeId: string;
  title: string;
  customVariables?: TemplateVariableMap;
  issueDate?: string | null;
  expiryDate?: string | null;
  effectiveDate?: string | null;
  visibility?: "HR" | "Manager" | "Employee";
}): Promise<{ documentId: string; versionId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can generate documents.");

  const { data: template, error: templateErr } = await supabase
    .from("document_templates")
    .select("id, name, body, document_type_id, is_active")
    .eq("id", input.templateId)
    .maybeSingle();
  if (templateErr || !template || !template.is_active) throw new Error("Template not found, or it's inactive.");

  const employeeVars = await resolveEmployeeVariables(supabase, input.employeeId);
  const rendered = substituteTemplate(template.body, { ...employeeVars, ...(input.customVariables ?? {}) });

  const file = new File([rendered], `${input.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.txt`, { type: "text/plain" });

  const result = await createDocument({
    employeeId: input.employeeId,
    documentTypeId: template.document_type_id,
    docTypeLabel: template.name,
    title: input.title,
    visibility: input.visibility ?? "HR",
    sensitivity: "Confidential",
    file,
    issueDate: input.issueDate ?? null,
    expiryDate: input.expiryDate ?? null,
    effectiveDate: input.effectiveDate ?? null,
  });

  const { writeDocumentEvent } = await import("./events");
  const { data: appUserOrg } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  await writeDocumentEvent(supabase, {
    orgId: appUserOrg?.org_id ?? "",
    documentId: result.documentId,
    versionId: result.versionId,
    eventType: "document.generated",
    actorId: user.id,
    metadata: { templateId: input.templateId, templateName: template.name },
  });

  return result;
}
