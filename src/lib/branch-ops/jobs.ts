// Scheduled Branch Operations jobs, run by Vercel cron with the service
// role (no user session; inherently cross-org). Each org that has saved its
// Branch Operations settings takes part. Every alert is recorded once in
// branch_ops_alerts, so a job that is retried never sends twice.
import type { Db } from "@/lib/hub/context";
import { notify } from "@/lib/hub/context";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { alertOwners, alertPerson, loadSettings } from "./alerts";
import { loadRegister } from "./register";
import { eveningSummaryMessages, isReportLate, morningAlertMessage, morningExceptions, normaliseKenyanMsisdn, type BranchEvening } from "./rules";

async function orgsWithSettings(db: Db): Promise<string[]> {
  const { data } = await db.from("branch_ops_settings").select("org_id");
  return (data ?? []).map((r) => r.org_id as string);
}

async function branchesOf(db: Db, orgId: string) {
  const { data } = await db.from("branches").select("id, name, manager_employee_id, deputy_employee_id").eq("org_id", orgId).order("name");
  return (data ?? []) as { id: string; name: string; manager_employee_id: string | null; deputy_employee_id: string | null }[];
}

function chunk(lines: string[], head: string, max = 900): string[] {
  const out: string[] = [];
  let cur = head;
  for (const l of lines) {
    if ((cur + " | " + l).length > max) {
      out.push(cur);
      cur = l;
    } else cur = `${cur} | ${l}`;
  }
  out.push(cur);
  return out;
}

// ~8:20 am: late arrivals, people not in, branches nobody has opened.
export async function runMorningJob(db: Db) {
  const { date, time } = nairobiNow();
  const results: Record<string, number> = {};
  for (const orgId of await orgsWithSettings(db)) {
    const settings = await loadSettings(db, orgId);
    const branches = await branchesOf(db, orgId);
    const reg = await loadRegister(db, { orgId, date, today: date });
    const roster = reg.map((r) => ({
      employeeId: r.employeeId,
      name: r.name,
      branchId: r.branchId,
      shiftStart: r.shift.start_time.slice(0, 5),
      graceMinutes: r.shift.grace_minutes,
      onLeave: r.onLeave || r.status === "Holiday",
      clockIn: r.clockIn,
      clockOut: r.clockOut,
    }));
    const lines = morningExceptions(branches, roster, time)
      .map(morningAlertMessage)
      .filter((m): m is string => !!m);
    results[orgId] = lines.length
      ? await alertOwners(db, settings, { orgId, type: "late", date }, chunk(lines, `Morning attendance ${date}:`), { title: "Morning attendance exceptions", actionUrl: "/dashboard/branch-ops" })
      : 0;
  }
  return { job: "morning", date, results };
}

// At closing: remind each manager whose report is not in yet.
export async function runReminderJob(db: Db) {
  const { date } = nairobiNow();
  let reminded = 0;
  for (const orgId of await orgsWithSettings(db)) {
    const settings = await loadSettings(db, orgId);
    const branches = await branchesOf(db, orgId);
    const { data: reports } = await db.from("branch_daily_reports").select("branch_id").eq("org_id", orgId).eq("report_date", date).eq("is_current", true);
    const done = new Set((reports ?? []).map((r) => r.branch_id as string));
    for (const b of branches) {
      if (done.has(b.id)) continue;
      for (const empId of [b.manager_employee_id, b.deputy_employee_id]) {
        if (!empId) continue;
        const { data: emp } = await db.from("employees").select("phone_number").eq("id", empId).maybeSingle();
        const phone = emp?.phone_number ? normaliseKenyanMsisdn(String(emp.phone_number)) : null;
        const sent = await alertPerson(
          db,
          { orgId, type: "report_reminder", date, branchId: b.id, employeeId: empId },
          phone,
          `Reminder: the ${b.name} daily report for ${date} is due by ${settings.report_deadline}. Submit it in SKMG-HR under Branch Daily Report.`
        );
        if (sent) reminded++;
        const { data: au } = await db.from("app_users").select("id").eq("employee_id", empId).maybeSingle();
        if (au) await notify(db, { orgId, userIds: [au.id as string], type: "BRANCH_REPORT_REMINDER", category: "attendance", title: `${b.name} daily report due`, message: `Due by ${settings.report_deadline} today.`, entityType: "branch", entityId: b.id, actionUrl: "/dashboard/branch-report" });
      }
    }
  }
  return { job: "reminder", date, reminded };
}

// ~11 pm: one consolidated summary to the owners, then tidy old photos.
export async function runSummaryJob(db: Db) {
  const now = nairobiNow();
  const date = now.date;
  const results: Record<string, number> = {};
  for (const orgId of await orgsWithSettings(db)) {
    const settings = await loadSettings(db, orgId);
    const branches = await branchesOf(db, orgId);
    if (!branches.length) continue;
    const [reg, { data: reports }] = await Promise.all([
      loadRegister(db, { orgId, date, today: date }),
      db.from("branch_daily_reports").select("branch_id, submitted_late, total_sales, cash_variance").eq("org_id", orgId).eq("report_date", date).eq("is_current", true),
    ]);
    const repBy = new Map((reports ?? []).map((r) => [r.branch_id as string, r]));
    const rows: BranchEvening[] = branches.map((b) => {
      const people = reg.filter((r) => r.branchId === b.id && r.status !== "On Leave" && r.status !== "Holiday");
      const rep = repBy.get(b.id);
      return {
        branchName: b.name,
        reportIn: !!rep,
        reportLate: !!rep?.submitted_late,
        totalSales: rep ? Number(rep.total_sales) : null,
        variance: rep ? Number(rep.cash_variance) : null,
        present: people.filter((p) => p.clockIn).length,
        expected: people.length,
        lateCount: people.filter((p) => p.minutesLate > 0).length,
      };
    });
    const missing = rows.filter((r) => !r.reportIn);
    if (missing.length && isReportLate(date, settings.report_deadline, now)) {
      // Recorded separately so the dashboard history shows which were missing.
      await db.from("branch_ops_alerts").insert({ org_id: orgId, alert_type: "report_missing", alert_date: date, detail: missing.map((m) => m.branchName).join(", ") }).then(() => {}, () => {});
    }
    results[orgId] = await alertOwners(db, settings, { orgId, type: "daily_summary", date }, eveningSummaryMessages(date, rows, settings.cash_variance_threshold), {
      title: `Daily summary ${date}`,
      actionUrl: `/dashboard/branch-ops?date=${date}`,
    });
    await purgeOldPhotos(db, orgId, settings.photo_retention_days);
  }
  return { job: "summary", date, results };
}

// Clock-in photos are personal data: delete them after the retention period
// the owners set (default 90 days). The clock times themselves are kept.
async function purgeOldPhotos(db: Db, orgId: string, days: number) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data: emps } = await db.from("employees").select("id").eq("org_id", orgId);
  const ids = (emps ?? []).map((e) => e.id as string);
  if (!ids.length) return;
  const { data: rows } = await db
    .from("attendance")
    .select("id, clock_in_photo_path, clock_out_photo_path")
    .in("employee_id", ids)
    .lt("work_date", cutoff)
    .or("clock_in_photo_path.not.is.null,clock_out_photo_path.not.is.null")
    .limit(500);
  const { data: brs } = await db
    .from("attendance_breaks")
    .select("id, start_photo_path, end_photo_path")
    .eq("org_id", orgId)
    .lt("work_date", cutoff)
    .or("start_photo_path.not.is.null,end_photo_path.not.is.null")
    .limit(500);
  const paths = [
    ...(rows ?? []).flatMap((r) => [r.clock_in_photo_path, r.clock_out_photo_path]),
    ...(brs ?? []).flatMap((b) => [b.start_photo_path, b.end_photo_path]),
  ].filter((p): p is string => !!p);
  if (!paths.length) return;
  const { error } = await db.storage.from("kiosk-photos").remove(paths);
  if (error) return;
  if (rows?.length) await db.from("attendance").update({ clock_in_photo_path: null, clock_out_photo_path: null }).in("id", rows.map((r) => r.id));
  if (brs?.length) await db.from("attendance_breaks").update({ start_photo_path: null, end_photo_path: null }).in("id", brs.map((b) => b.id));
}
