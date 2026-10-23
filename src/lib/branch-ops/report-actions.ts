"use server";

// The branch manager's daily report and their missed-clock requests.
// Who may submit is decided here (the caller must be the branch's manager or
// deputy), and rows are written with the service role because there are no
// client write policies on these tables (see migration 0153).
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { toResult, type FormResult } from "@/lib/actions/form-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCtx, str, type Ctx, type Db } from "@/lib/hub/context";
import { allowedReportDates, branchesRunBy, type RunBranch } from "./report-data";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { createApprovalRequest } from "@/lib/approvals/create-approval-request";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { alertOwners, loadSettings } from "./alerts";
import { isReportLate, parseAmount, parseCount, varianceFlagged } from "./rules";

async function requireRunner(branchId: string): Promise<{ c: Ctx & { employeeId: string }; branch: RunBranch; db: Db }> {
  const c = await getCtx();
  const branch = (await branchesRunBy(c)).find((b) => b.id === branchId);
  if (!branch || !c.employeeId) throw new Error("Only this branch's manager or deputy can do this.");
  return { c: c as Ctx & { employeeId: string }, branch, db: createAdminClient() as Db };
}

const MONEY = ["phones_value", "accessories_value", "services_value", "pay_cash", "pay_mpesa", "pay_card", "pay_credit", "opening_float", "cash_banked", "petty_cash_total", "closing_cash"] as const;
const COUNTS = ["phones_units", "accessories_units"] as const;
const TEXTS = ["top_models", "banking_reference", "petty_cash_notes", "stock_received", "stock_transferred", "returns_warranty", "low_stock", "complaints", "enquiries", "incident_details", "remarks"] as const;
const LABEL: Record<string, string> = {
  phones_value: "Phones sold (KES)",
  accessories_value: "Accessories sold (KES)",
  services_value: "Repairs and services (KES)",
  pay_cash: "Cash received",
  pay_mpesa: "M-Pesa received",
  pay_card: "Card received",
  pay_credit: "Credit / Lipa Mdogo Mdogo",
  opening_float: "Opening float",
  cash_banked: "Cash banked",
  petty_cash_total: "Petty cash spent",
  closing_cash: "Closing cash",
  phones_units: "Phones sold (units)",
  accessories_units: "Accessories sold (units)",
};
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE = 4 * 1024 * 1024;

export async function submitBranchReport(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const branchId = str(fd.get("branch_id"));
    const { c, branch, db } = await requireRunner(branchId);
    const reportDate = str(fd.get("report_date"));
    if (!(await allowedReportDates()).includes(reportDate)) throw new Error("You can only report on today or yesterday.");
    if (fd.get("confirmed") !== "on") throw new Error("Tick the box to confirm the report is accurate.");

    const row: Record<string, unknown> = {};
    for (const k of MONEY) {
      const v = parseAmount(str(fd.get(k)));
      if (v === null) throw new Error(`${LABEL[k]}: enter an amount in shillings, e.g. 12500.`);
      row[k] = v;
    }
    for (const k of COUNTS) {
      const v = parseCount(str(fd.get(k)));
      if (v === null) throw new Error(`${LABEL[k]}: enter a whole number.`);
      row[k] = v;
    }
    for (const k of TEXTS) row[k] = str(fd.get(k)).slice(0, 2000) || null;
    const walkIns = str(fd.get("walk_ins"));
    row.walk_ins = walkIns ? parseCount(walkIns) : null;
    if (walkIns && row.walk_ins === null) throw new Error("Walk-ins: enter a whole number.");
    const incident = str(fd.get("incident_type")) || "none";
    if (!["none", "theft", "damage", "security", "outage", "other"].includes(incident)) throw new Error("Choose an incident type.");
    if (incident !== "none" && !row.incident_details) throw new Error("Describe the incident.");
    row.incident_type = incident;
    const opened = str(fd.get("opened_at"));
    const closed = str(fd.get("closed_at"));
    for (const t of [opened, closed]) if (t && !/^\d{2}:\d{2}$/.test(t)) throw new Error("Enter opening and closing times as HH:MM.");
    row.opened_at = opened || null;
    row.closed_at = closed || null;

    const remarks: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("remark_") && typeof v === "string" && v.trim()) remarks[k.slice(7)] = v.trim().slice(0, 300);
    }
    row.attendance_remarks = remarks;

    const pettyCash = row.petty_cash_total as number;
    if (pettyCash > 0 && !row.petty_cash_notes) throw new Error("Say what the petty cash was spent on.");

    const files: { kind: string; file: File }[] = [];
    for (const kind of ["bank_slip", "receipt"] as const) {
      for (const f of fd.getAll(kind)) {
        if (!(f instanceof File) || f.size === 0) continue;
        if (!FILE_TYPES.includes(f.type)) throw new Error(`${f.name}: upload a photo (JPG/PNG) or a PDF.`);
        if (f.size > MAX_FILE) throw new Error(`${f.name} is larger than 4 MB.`);
        files.push({ kind, file: f });
      }
    }
    if ((row.cash_banked as number) > 0 && !row.banking_reference && !files.some((f) => f.kind === "bank_slip")) {
      throw new Error("Cash was banked: add the bank slip photo or the M-Pesa / deposit reference.");
    }
    if (pettyCash > 0 && !files.some((f) => f.kind === "receipt")) throw new Error("Add a photo of the petty cash receipt(s).");

    const settings = await loadSettings(db, c.orgId);
    const now = nairobiNow();
    const { data: prev } = await db
      .from("branch_daily_reports")
      .select("id, version")
      .eq("branch_id", branchId)
      .eq("report_date", reportDate)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (prev?.version ?? 0) + 1;
    if (prev) await db.from("branch_daily_reports").update({ is_current: false }).eq("branch_id", branchId).eq("report_date", reportDate);

    const { data: saved, error } = await db
      .from("branch_daily_reports")
      .insert({
        ...row,
        org_id: c.orgId,
        branch_id: branchId,
        report_date: reportDate,
        version,
        is_current: true,
        submitted_by_user: c.userId,
        submitted_by_employee: c.employeeId,
        submitted_late: isReportLate(reportDate, settings.report_deadline, now),
        confirmed: true,
      })
      .select("id, cash_variance, total_sales")
      .single();
    if (error) {
      // Put the previous version back if the new one could not be saved.
      if (prev) await db.from("branch_daily_reports").update({ is_current: true }).eq("id", prev.id);
      throw new Error(error.message);
    }

    for (const { kind, file } of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const path = `${c.orgId}/${branchId}/${reportDate}/v${version}/${randomUUID().slice(0, 8)}-${safe}`;
      const up = await db.storage.from("branch-report-files").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
      if (up.error) throw new Error(`The report was saved, but ${file.name} did not upload. Submit again to retry.`);
      await db.from("branch_report_files").insert({ org_id: c.orgId, report_id: saved.id, kind, storage_path: path, file_name: file.name.slice(0, 200) });
    }

    await recordAuditEvent(db, {
      orgId: c.orgId,
      actorUserId: c.userId,
      actorRole: c.role,
      action: version === 1 ? "branch_report.submitted" : "branch_report.corrected",
      resourceType: "branch_daily_report",
      resourceId: saved.id,
      eventCategory: "data",
      after: { branch: branch.name, report_date: reportDate, version },
    }).catch(() => {});

    const variance = Number(saved.cash_variance);
    const link = `/dashboard/branch-ops/reports/${saved.id}`;
    if (varianceFlagged(variance, settings.cash_variance_threshold)) {
      await alertOwners(
        db,
        settings,
        { orgId: c.orgId, type: "cash_variance", date: reportDate, branchId },
        [`${branch.name} ${reportDate}: cash ${variance < 0 ? "SHORT" : "OVER"} by KES ${Math.abs(Math.round(variance)).toLocaleString("en-KE")} in the daily report.`],
        { title: `Cash variance at ${branch.name}`, actionUrl: link }
      );
    }
    if (incident !== "none") {
      await alertOwners(
        db,
        settings,
        { orgId: c.orgId, type: "incident", date: reportDate, branchId },
        [`${branch.name} ${reportDate}: ${incident} incident reported - ${String(row.incident_details).slice(0, 300)}`],
        { title: `Incident at ${branch.name}`, actionUrl: link }
      );
    }

    revalidatePath("/dashboard/branch-report");
    revalidatePath("/dashboard/branch-ops");
  });
}

// A manager asks the owners to add a clock time a staff member missed. Goes
// through the shared approval engine to the administrators; the attendance
// row changes only when they approve (decideAttendanceCorrectionRequest).
// Managers cannot raise one for themselves.
export async function requestMissedClock(_prev: FormResult, fd: FormData): Promise<FormResult> {
  return toResult(async () => {
    const branchId = str(fd.get("branch_id"));
    const { c, branch, db } = await requireRunner(branchId);
    const employeeId = str(fd.get("employee_id"));
    const workDate = str(fd.get("work_date"));
    const field = str(fd.get("field"));
    const value = str(fd.get("requested_value"));
    const reason = str(fd.get("reason"));
    if (employeeId === c.employeeId) throw new Error("You can't request a correction to your own attendance. Ask the owners.");
    if (field !== "clock_in" && field !== "clock_out") throw new Error("Choose clock in or clock out.");
    if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Enter the time as HH:MM.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || workDate > nairobiNow().date) throw new Error("Choose a date that is not in the future.");
    if (reason.length < 5) throw new Error("Give the reason for the correction.");

    const { data: emp } = await db.from("employees").select("id, name, branch_id, org_id").eq("id", employeeId).maybeSingle();
    if (!emp || emp.org_id !== c.orgId || emp.branch_id !== branchId) throw new Error("That person is not on this branch's staff.");

    const { data: reqRow, error } = await db
      .from("attendance_correction_requests")
      .insert({ org_id: c.orgId, employee_id: employeeId, work_date: workDate, field, requested_value: value, reason: `${reason} (requested by ${branch.name} ${branch.role})`, status: "Under Review" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const approvalId = await createApprovalRequest(db, {
      orgId: c.orgId,
      requestType: "attendance_correction",
      entityType: "attendance_correction_request",
      entityId: reqRow.id,
      requestedBy: c.userId,
      subjectEmployeeId: employeeId,
      summary: `${branch.name}: set ${field.replace("_", " ")} on ${workDate} to ${value} for ${emp.name}`,
      impact: { workDate, field, requestedValue: value },
      steps: [{ approverRole: "admin" }],
    });
    await db.from("attendance_correction_requests").update({ approval_request_id: approvalId }).eq("id", reqRow.id);
    revalidatePath("/dashboard/branch-report");
    revalidatePath("/dashboard/approvals");
  });
}
