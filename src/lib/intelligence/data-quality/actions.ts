"use server";

// Area 10 §5.9 Data Quality screen actions. Admin/hr only (role check here
// plus the analytics_dq_events_hr_all RLS policy, same defense-in-depth
// pattern as notifications/admin-actions.ts).
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { runDataQualityScan } from "./run-data-quality-scan";

async function requireAdminOrHr(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) {
    throw new Error("Only admin/HR can view workforce intelligence data quality.");
  }
  return { userId: user.id, orgId: appUser.org_id as string };
}

export async function triggerDataQualityScan() {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const result = await runDataQualityScan(supabase, orgId);
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "data_quality.scan_run",
    resourceType: "analytics_data_quality_events",
    resourceId: null,
    eventCategory: "configuration",
    metadata: { findings: result.findings.length },
  });
  revalidatePath("/dashboard/analytics/data-quality");
  return result;
}

export async function resolveDataQualityEvent(formData: FormData) {
  const supabase = await createClient();
  const { orgId, userId } = await requireAdminOrHr(supabase);
  const id = formData.get("id") as string;
  const note = (formData.get("resolution_note") as string) || null;
  const { error } = await supabase
    .from("analytics_data_quality_events")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId, resolution_note: note })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "data_quality.event_resolved",
    resourceType: "analytics_data_quality_events",
    resourceId: id,
    eventCategory: "configuration",
    metadata: { note },
  });
  revalidatePath("/dashboard/analytics/data-quality");
}
