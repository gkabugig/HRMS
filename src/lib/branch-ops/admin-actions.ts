"use server";

// Owner (admin/HR) setup for Branch Operations: settings, who runs each
// branch, kiosk devices and staff PINs. Writes use the service role after
// requireHrCtx(), since the new tables have no client write policies.
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireHrCtx, str, type Db } from "@/lib/hub/context";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { hashPin, newPairingCode, pinProblem, sha256 } from "./secrets";
import { normaliseKenyanMsisdn, parseAmount } from "./rules";

const PATH = "/dashboard/branch-ops/settings";
const PAIRING_MINUTES = 15;
const TIME = /^\d{2}:\d{2}$/;

export async function saveOpsSettings(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const deadline = str(fd.get("report_deadline"));
    if (!TIME.test(deadline)) throw new Error("Enter the report deadline as HH:MM.");
    const threshold = parseAmount(str(fd.get("cash_variance_threshold")));
    if (threshold === null) throw new Error("Enter the cash variance limit in shillings.");
    const retention = Number(str(fd.get("photo_retention_days")) || "90");
    if (!Number.isInteger(retention) || retention < 7 || retention > 3650) throw new Error("Keep photos for between 7 and 3650 days.");
    const numbers: string[] = [];
    for (const raw of str(fd.get("owner_whatsapp_numbers")).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
      const n = normaliseKenyanMsisdn(raw);
      if (!n) throw new Error(`${raw} is not a Kenyan mobile number.`);
      if (!numbers.includes(n)) numbers.push(n);
    }
    const db = createAdminClient() as Db;
    const { error } = await db.from("branch_ops_settings").upsert({
      org_id: c.orgId,
      report_deadline: deadline,
      cash_variance_threshold: threshold,
      owner_whatsapp_numbers: numbers,
      photo_retention_days: retention,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await recordAuditEvent(db, { orgId: c.orgId, actorUserId: c.userId, actorRole: c.role, action: "branch_ops.settings_saved", resourceType: "branch_ops_settings", resourceId: c.orgId, eventCategory: "configuration", after: { deadline, threshold, numbers: numbers.length, retention } }).catch(() => {});
    revalidatePath(PATH);
  });
}

async function branchInOrg(db: Db, orgId: string, branchId: string) {
  const { data } = await db.from("branches").select("id, name").eq("id", branchId).eq("org_id", orgId).maybeSingle();
  if (!data) throw new Error("Branch not found.");
  return data as { id: string; name: string };
}

export async function saveBranchRunners(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const db = createAdminClient() as Db;
    const branch = await branchInOrg(db, c.orgId, str(fd.get("branch_id")));
    const manager = str(fd.get("manager_employee_id")) || null;
    const deputy = str(fd.get("deputy_employee_id")) || null;
    if (manager && manager === deputy) throw new Error("The manager and deputy must be different people.");
    for (const id of [manager, deputy]) {
      if (!id) continue;
      const { data } = await db.from("employees").select("id").eq("id", id).eq("org_id", c.orgId).eq("status", "Active").maybeSingle();
      if (!data) throw new Error("Choose an active employee.");
    }
    const opening = str(fd.get("opening_time")) || null;
    const closing = str(fd.get("closing_time")) || null;
    for (const t of [opening, closing]) if (t && !TIME.test(t)) throw new Error("Enter times as HH:MM.");
    const { error } = await db
      .from("branches")
      .update({ manager_employee_id: manager, deputy_employee_id: deputy, opening_time: opening, closing_time: closing })
      .eq("id", branch.id);
    if (error) throw new Error(error.message);
    revalidatePath(PATH);
  });
}

export type PairingResult = FormResult & { code?: string; kioskName?: string; expiresAt?: string };

async function issueCode(db: Db, kioskId: string): Promise<{ code: string; expiresAt: string }> {
  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60000).toISOString();
  const { error } = await db.from("branch_kiosks").update({ pairing_code_hash: sha256(code), pairing_expires_at: expiresAt }).eq("id", kioskId);
  if (error) throw new Error(error.message);
  return { code, expiresAt };
}

// Adds a kiosk for a branch and returns its one-time pairing code.
export async function createKiosk(_prev: PairingResult, fd: FormData): Promise<PairingResult> {
  try {
    const c = await requireHrCtx();
    const db = createAdminClient() as Db;
    const branch = await branchInOrg(db, c.orgId, str(fd.get("branch_id")));
    const name = str(fd.get("name")) || `${branch.name} kiosk`;
    const { data, error } = await db.from("branch_kiosks").insert({ org_id: c.orgId, branch_id: branch.id, name: name.slice(0, 80), created_by: c.userId }).select("id").single();
    if (error) throw new Error(error.message);
    const { code, expiresAt } = await issueCode(db, data.id);
    revalidatePath(PATH);
    return { success: true, code, kioskName: name, expiresAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add the kiosk." };
  }
}

// Re-pair an existing kiosk (new tablet, cleared browser). The old device
// stops working the moment the new one pairs.
export async function repairKiosk(kioskId: string, _prev: PairingResult): Promise<PairingResult> {
  try {
    const c = await requireHrCtx();
    const db = createAdminClient() as Db;
    const { data: k } = await db.from("branch_kiosks").select("id, name").eq("id", kioskId).eq("org_id", c.orgId).maybeSingle();
    if (!k) throw new Error("Kiosk not found.");
    await db.from("branch_kiosks").update({ revoked_at: null }).eq("id", k.id);
    const { code, expiresAt } = await issueCode(db, k.id);
    revalidatePath(PATH);
    return { success: true, code, kioskName: k.name, expiresAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create a pairing code." };
  }
}

export async function revokeKiosk(kioskId: string, _prev: FormResult): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const db = createAdminClient() as Db;
    const { error } = await db
      .from("branch_kiosks")
      .update({ revoked_at: new Date().toISOString(), token_hash: null, pairing_code_hash: null, pairing_expires_at: null })
      .eq("id", kioskId)
      .eq("org_id", c.orgId);
    if (error) throw new Error(error.message);
    await recordAuditEvent(db, { orgId: c.orgId, actorUserId: c.userId, actorRole: c.role, action: "branch_ops.kiosk_revoked", resourceType: "branch_kiosk", resourceId: kioskId, eventCategory: "security" }).catch(() => {});
    revalidatePath(PATH);
  });
}

export async function setStaffPin(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await requireHrCtx();
    const employeeId = str(fd.get("employee_id"));
    const pin = str(fd.get("pin"));
    const problem = pinProblem(pin);
    if (problem) throw new Error(problem);
    const db = createAdminClient() as Db;
    const { data: emp } = await db.from("employees").select("id").eq("id", employeeId).eq("org_id", c.orgId).maybeSingle();
    if (!emp) throw new Error("Choose a staff member.");
    const { error } = await db.from("employee_kiosk_pins").upsert({
      employee_id: employeeId,
      org_id: c.orgId,
      pin_hash: await hashPin(pin),
      failed_attempts: 0,
      locked_until: null,
      set_by: c.userId,
      set_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await recordAuditEvent(db, { orgId: c.orgId, actorUserId: c.userId, actorRole: c.role, action: "branch_ops.pin_set", resourceType: "employee", resourceId: employeeId, eventCategory: "security" }).catch(() => {});
    revalidatePath(PATH);
  });
}
