"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHr() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || (appUser.role !== "admin" && appUser.role !== "hr")) {
    throw new Error("Not authorised to review payroll anomalies.");
  }
  return { supabase, userId: user.id, orgId: appUser.org_id, role: appUser.role };
}

// A reviewer decision. Never edits the underlying payslip — spec §6.4:
// "Never auto-change payroll solely because an anomaly is detected." This
// only records the human's read on the alert.
export async function decideAnomaly(formData: FormData) {
  const anomalyId = String(formData.get("anomaly_id"));
  const decision = String(formData.get("decision")) as "resolved" | "false_positive" | "reviewed";
  const note = String(formData.get("note") || "").trim() || null;

  const { supabase, userId, orgId } = await requireHr();

  const { data: anomaly } = await supabase.from("ai_anomalies").select("id, org_id, anomaly_type, payroll_run_id").eq("id", anomalyId).maybeSingle();
  if (!anomaly || anomaly.org_id !== orgId) throw new Error("Anomaly not found.");

  await supabase
    .from("ai_anomalies")
    .update({ status: decision, reviewer_id: userId, reviewed_at: new Date().toISOString(), reviewer_note: note })
    .eq("id", anomalyId);

  await supabase.from("ai_feedback").insert({
    org_id: orgId,
    user_id: userId,
    anomaly_id: anomalyId,
    feedback_type: decision === "reviewed" ? "useful" : decision,
    comment: note,
  });

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: `payroll_anomaly_${decision}`,
    resourceType: "ai_anomaly",
    resourceId: anomalyId,
    eventCategory: "data",
    metadata: { anomaly_type: anomaly.anomaly_type, payroll_run_id: anomaly.payroll_run_id, note },
  });

  revalidatePath("/dashboard/payroll/anomalies");
}
