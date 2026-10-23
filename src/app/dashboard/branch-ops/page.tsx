import Link from "next/link";
import { pageCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { loadRegister, signedUrls, type RegisterRow } from "@/lib/branch-ops/register";
import { loadSettings } from "@/lib/branch-ops/alerts";
import { isReportLate, varianceFlagged } from "@/lib/branch-ops/rules";
import { Chip, Empty, PageTitle, Panel, fmtDate } from "@/components/ui/page-kit";
import OpsNav, { NotAllowed } from "./ops-nav";

type Tone = "green" | "amber" | "red" | "neutral" | "blue";
const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

export default async function BranchOpsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const c = await pageCtx();
  if (!["admin", "hr"].includes(c.role)) return <NotAllowed />;
  const sp = await searchParams;
  const today = nairobiNow().date;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const isToday = date === today;
  const db = createAdminClient() as Db;

  const [{ data: branches }, register, settings, { data: reports }, { count: pendingFixes }, { data: kiosks }] = await Promise.all([
    db.from("branches").select("id, name, manager_employee_id, deputy_employee_id").eq("org_id", c.orgId).order("name"),
    loadRegister(db, { orgId: c.orgId, date, today }),
    loadSettings(db, c.orgId),
    db
      .from("branch_daily_reports")
      .select("id, branch_id, submitted_at, submitted_late, total_sales, cash_variance, incident_type, version")
      .eq("org_id", c.orgId)
      .eq("report_date", date)
      .eq("is_current", true),
    db.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("status", "Under Review"),
    db.from("branch_kiosks").select("branch_id, last_seen_at, revoked_at, token_hash").eq("org_id", c.orgId),
  ]);

  const reportBy = new Map((reports ?? []).map((r) => [r.branch_id as string, r]));
  const nowKe = nairobiNow();
  const pastDeadline = isReportLate(date, settings.report_deadline, nowKe);

  const tiles = (branches ?? []).map((b) => {
    const people = register.filter((r) => r.branchId === b.id && r.status !== "On Leave" && r.status !== "Holiday");
    const present = people.filter((r) => r.clockIn).length;
    const late = people.filter((r) => r.minutesLate > 0).length;
    const absent = people.filter((r) => r.status === "Absent").length;
    const opened = people.map((r) => r.clockIn).filter(Boolean).sort()[0] ?? null;
    const rep = reportBy.get(b.id);
    const variance = rep ? Number(rep.cash_variance) : null;
    const flagged = variance != null && varianceFlagged(variance, settings.cash_variance_threshold);
    const kioskOk = (kiosks ?? []).some((k) => k.branch_id === b.id && !k.revoked_at && k.token_hash);
    const reportState: { label: string; tone: Tone } = rep
      ? rep.submitted_late
        ? { label: "Report in (late)", tone: "amber" }
        : { label: "Report in", tone: "green" }
      : pastDeadline
        ? { label: "Report missing", tone: "red" }
        : { label: "Report due", tone: "neutral" };
    const tone: Tone = flagged || reportState.tone === "red" || (people.length > 0 && present === 0 && isToday) ? "red" : late || absent || reportState.tone === "amber" ? "amber" : "green";
    return { b, people: people.length, present, late, absent, opened, rep, variance, flagged, reportState, tone, kioskOk, noRunner: !b.manager_employee_id };
  });

  const exceptions: { who: string; branch: string; what: string; tone: Tone }[] = [];
  const branchName = new Map((branches ?? []).map((b) => [b.id as string, b.name as string]));
  for (const r of register) {
    const bn = branchName.get(r.branchId) ?? "";
    if (r.minutesLate > 0) exceptions.push({ who: r.name, branch: bn, what: `Late: in at ${r.clockIn} (+${r.minutesLate} min)`, tone: "amber" });
    if (r.status === "Absent") exceptions.push({ who: r.name, branch: bn, what: "Absent, no leave on file", tone: "red" });
    if (r.status === "Missing Clock-out") exceptions.push({ who: r.name, branch: bn, what: `No clock-out (in at ${r.clockIn})`, tone: "amber" });
  }

  const inNow: RegisterRow[] = isToday ? register.filter((r) => r.clockIn && !r.clockOut) : [];
  const photos = await signedUrls(db, "kiosk-photos", inNow.map((r) => r.clockInPhoto));
  const totalSales = tiles.reduce((s, t) => s + (t.rep ? Number(t.rep.total_sales) : 0), 0);
  const prev = new Date(`${date}T12:00:00+03:00`);
  prev.setDate(prev.getDate() - 1);
  const next = new Date(`${date}T12:00:00+03:00`);
  next.setDate(next.getDate() + 1);

  return (
    <div className="space-y-6">
      <PageTitle title="Branch Operations" subtitle={`${fmtDate(date)} · ${tiles.filter((t) => t.rep).length}/${tiles.length} reports in · ${kes(totalSales)} sales reported`}>
        <OpsNav current="/dashboard/branch-ops" />
        <div className="flex items-center gap-3 text-xs">
          <Link href={`?date=${prev.toISOString().slice(0, 10)}`} className="text-brand-600 hover:underline">
            ← Previous day
          </Link>
          {!isToday && (
            <Link href={`?date=${next.toISOString().slice(0, 10)}`} className="text-brand-600 hover:underline">
              Next day →
            </Link>
          )}
          {!isToday && (
            <Link href="/dashboard/branch-ops" className="text-brand-600 hover:underline">
              Today
            </Link>
          )}
          {(pendingFixes ?? 0) > 0 && (
            <Link href="/dashboard/approvals" className="ml-auto">
              <Chip tone="amber">{pendingFixes} clock correction{pendingFixes === 1 ? "" : "s"} awaiting approval</Chip>
            </Link>
          )}
        </div>
      </PageTitle>

      {tiles.length === 0 ? (
        <Panel>
          <Empty>No branches yet. Add them under Branches, then assign managers and kiosks in Settings.</Empty>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {tiles.map((t) => (
            <div
              key={t.b.id}
              className={`rounded-2xl border p-4 bg-[var(--surface)] ${t.tone === "red" ? "border-red-300" : t.tone === "amber" ? "border-amber-300" : "border-[var(--border-subtle)]"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-neutral-900 dark:text-neutral-50">{t.b.name}</h2>
                <Chip tone={t.reportState.tone}>{t.reportState.label}</Chip>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-neutral-500">Staff in</dt>
                <dd className="tabular-nums">
                  {t.present}/{t.people}
                  {t.late > 0 && <span className="text-amber-700"> · {t.late} late</span>}
                  {t.absent > 0 && <span className="text-red-600"> · {t.absent} absent</span>}
                </dd>
                <dt className="text-neutral-500">Opened</dt>
                <dd className="tabular-nums">{t.opened ?? (isToday ? "Not yet" : "—")}</dd>
                <dt className="text-neutral-500">Sales</dt>
                <dd className="tabular-nums">{t.rep ? kes(Number(t.rep.total_sales)) : "—"}</dd>
                <dt className="text-neutral-500">Cash variance</dt>
                <dd className={`tabular-nums ${t.flagged ? "text-red-600 font-semibold" : ""}`}>{t.variance == null ? "—" : kes(t.variance)}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {t.rep && (
                  <Link href={`/dashboard/branch-ops/reports/${t.rep.id}`} className="text-brand-600 hover:underline">
                    Open report{t.rep.version > 1 ? ` (v${t.rep.version})` : ""}
                  </Link>
                )}
                {t.rep && t.rep.incident_type !== "none" && <Chip tone="red">Incident: {t.rep.incident_type}</Chip>}
                {!t.kioskOk && <Chip tone="amber">No kiosk paired</Chip>}
                {t.noRunner && <Chip tone="amber">No manager set</Chip>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Exceptions" subtitle="Late arrivals, absences and missing clock-outs for this day.">
          {exceptions.length === 0 ? (
            <Empty>Nothing to follow up.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
              {exceptions.map((e, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">{e.who}</span> <span className="text-neutral-500">· {e.branch}</span>
                  </span>
                  <Chip tone={e.tone}>{e.what}</Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {isToday && (
          <Panel title={`Who's in now (${inNow.length})`} subtitle="Clock-in photo, time and branch. Photos are kept for the period set in Settings.">
            {inNow.length === 0 ? (
              <Empty>Nobody is clocked in.</Empty>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {inNow.map((r) => {
                  const url = r.clockInPhoto ? photos.get(r.clockInPhoto) : null;
                  return (
                    <li key={r.employeeId} className="text-xs">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={`${r.name} clock-in photo`} className="w-full aspect-[4/3] object-cover rounded-lg bg-neutral-100" />
                      ) : (
                        <div className="w-full aspect-[4/3] rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">{r.source === "kiosk" ? "Photo missing" : "Not via kiosk"}</div>
                      )}
                      <p className="mt-1 font-medium">{r.name}</p>
                      <p className="text-neutral-500">
                        {branchName.get(r.branchId)} · in {r.clockIn}
                        {r.onBreak ? " · at lunch" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
