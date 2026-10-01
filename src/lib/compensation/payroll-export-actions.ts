"use server";

// Area 17 §8.4/§8.8 payroll_export_batches: a traceable, versioned record
// that compensation changes effective in a given period were handed off to
// payroll — distinct from Area 15's payroll_runs/payroll_outputs (which
// already execute payroll itself, reading employees' live basic/allowance
// columns directly). This batch is compensation's own paper trail: "these
// N effective-dated changes were exported for payroll to pick up."
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";

async function requireHrOrAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!appUser || !["admin", "hr"].includes(appUser.role)) throw new Error("Only admin/HR can export compensation changes to payroll.");
  return { userId: user.id, orgId: appUser.org_id as string };
}

export async function generatePayrollExportBatch(formData: FormData) {
  const supabase = await createClient();
  const { userId, orgId } = await requireHrOrAdmin(supabase);
  const period = String(formData.get("period") || "").trim();
  if (!period) throw new Error("Period is required (e.g. 2026-11).");

  const { data: changes } = await supabase
    .from("compensation_change_requests")
    .select("id, employee_id, effective_from, proposed_basic, proposed_house_allowance, proposed_transport_allowance, proposed_other_allowance")
    .eq("org_id", orgId)
    .eq("status", "effective")
    .like("effective_from", `${period}%`);

  const rowCount = changes?.length ?? 0;
  const checksum = createHash("sha256").update(JSON.stringify(changes ?? [])).digest("hex").slice(0, 16);

  const { data: batch, error } = await supabase
    .from("payroll_export_batches")
    .insert({ org_id: orgId, period, row_count: rowCount, checksum, exported_by: userId, status: "generated" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await recordAuditEvent(supabase, {
    orgId,
    actorUserId: userId,
    action: "payroll_export_batch.generated",
    resourceType: "payroll_export_batch",
    resourceId: batch.id,
    eventCategory: "export",
    riskLevel: "elevated",
    after: { period, rowCount, checksum },
  });

  revalidatePath("/dashboard/compensation/payroll-export");
}

export async function markPayrollExportBatchSent(batchId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("payroll_export_batches").update({ status: "sent" }).eq("id", batchId).eq("org_id", orgId);
  revalidatePath("/dashboard/compensation/payroll-export");
}

export async function markPayrollExportBatchConfirmed(batchId: string) {
  const supabase = await createClient();
  const { orgId } = await requireHrOrAdmin(supabase);
  await supabase.from("payroll_export_batches").update({ status: "confirmed" }).eq("id", batchId).eq("org_id", orgId);
  revalidatePath("/dashboard/compensation/payroll-export");
}
