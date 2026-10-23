import { pageCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { allowedReportDates, branchesRunBy } from "@/lib/branch-ops/report-data";
import { loadRegister } from "@/lib/branch-ops/register";
import { loadSettings } from "@/lib/branch-ops/alerts";
import { Chip, Empty, PageTitle, Panel, TabLinks, fmtDate, fmtDateTime } from "@/components/ui/page-kit";
import ReportForm, { type ReportDefaults } from "./report-form";
import MissedClockForm from "./missed-clock-form";

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "blue"> = {
  Present: "green",
  Late: "amber",
  Absent: "red",
  "Missing Clock-out": "amber",
  "On Leave": "blue",
  Holiday: "neutral",
  "Off Day": "neutral",
};

export default async function BranchReportPage({ searchParams }: { searchParams: Promise<{ branch?: string; date?: string }> }) {
  const c = await pageCtx();
  const sp = await searchParams;
  const branches = await branchesRunBy(c);

  if (!branches.length) {
    return (
      <div className="space-y-6">
        <PageTitle title="Branch daily report" />
        <Panel>
          <Empty>You are not set as the manager or deputy of any branch. The owners assign this in Branch Operations → Settings.</Empty>
        </Panel>
      </div>
    );
  }

  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0];
  const dates = await allowedReportDates();
  const date = dates.includes(sp.date ?? "") ? (sp.date as string) : dates[0];
  const db = createAdminClient() as Db;
  const today = nairobiNow().date;

  const [register, settings, { data: current }, { data: history }, { data: pending }] = await Promise.all([
    loadRegister(db, { orgId: c.orgId, date, today, branchIds: [branch.id] }),
    loadSettings(db, c.orgId),
    db.from("branch_daily_reports").select("*").eq("branch_id", branch.id).eq("report_date", date).eq("is_current", true).maybeSingle(),
    db
      .from("branch_daily_reports")
      .select("id, report_date, version, submitted_at, submitted_late, total_sales, cash_variance")
      .eq("branch_id", branch.id)
      .eq("is_current", true)
      .order("report_date", { ascending: false })
      .limit(14),
    db
      .from("attendance_correction_requests")
      .select("id, work_date, field, requested_value, status, created_at, employees!inner(name, branch_id)")
      .eq("employees.branch_id", branch.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const defaults: ReportDefaults | null = current
    ? {
        values: Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v == null ? "" : String(v).slice(0, k.endsWith("_at") && k !== "submitted_at" ? 5 : undefined)])),
        remarks: (current.attendance_remarks as Record<string, string>) ?? {},
      }
    : null;
  const firstIn = register.map((r) => r.clockIn).filter(Boolean).sort()[0] ?? "";
  const staff = register.filter((r) => r.employeeId !== c.employeeId).map((r) => ({ id: r.employeeId, name: r.name }));

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${branch.name} daily report`}
        subtitle={`Due by ${settings.report_deadline} each day. You can correct a submitted report; the owners see every version.`}
      >
        {branches.length > 1 && <TabLinks current={`?branch=${branch.id}`} items={branches.map((b) => ({ href: `?branch=${b.id}`, label: b.name }))} />}
        <TabLinks
          current={`?branch=${branch.id}&date=${date}`}
          items={dates.map((d, i) => ({ href: `?branch=${branch.id}&date=${d}`, label: i === 0 ? `Today (${fmtDate(d)})` : `Yesterday (${fmtDate(d)})` }))}
        />
      </PageTitle>

      {current && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Version {current.version} submitted {fmtDateTime(current.submitted_at)} {current.submitted_late && <Chip tone="amber">late</Chip>}. Saving again creates version {current.version + 1}.
        </p>
      )}

      <ReportForm
        branchId={branch.id}
        reportDate={date}
        threshold={settings.cash_variance_threshold}
        defaults={defaults}
        firstClockIn={firstIn}
        register={register.map((r) => ({
          employeeId: r.employeeId,
          name: r.name,
          status: r.status,
          tone: STATUS_TONE[r.status] ?? "neutral",
          clockIn: r.clockIn,
          clockOut: r.clockOut,
          minutesLate: r.minutesLate,
          breakMinutes: r.breakMinutes,
        }))}
      />

      <Panel title="Missed clock-in or clock-out" subtitle="If someone forgot to clock, request the correct time here. The owners approve it before it changes the record.">
        <MissedClockForm branchId={branch.id} staff={staff} today={today} />
        {(pending ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
            {(pending ?? []).map((p) => {
              const e = (Array.isArray(p.employees) ? p.employees[0] : p.employees) as { name: string } | null;
              return (
                <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                  <span>
                    {e?.name} · {p.field === "clock_in" ? "clock in" : "clock out"} {p.requested_value} on {fmtDate(p.work_date)}
                  </span>
                  <Chip tone={p.status === "Approved" ? "green" : p.status === "Rejected" ? "red" : "amber"}>{p.status}</Chip>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Recent reports">
        {(history ?? []).length === 0 ? (
          <Empty>No reports yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">Sales (KES)</th>
                <th className="py-1.5 font-medium">Cash variance</th>
                <th className="py-1.5 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((h) => (
                <tr key={h.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-1.5">{fmtDate(h.report_date)}</td>
                  <td className="py-1.5 tabular-nums">{Number(h.total_sales).toLocaleString("en-KE")}</td>
                  <td className={`py-1.5 tabular-nums ${Math.abs(Number(h.cash_variance)) > settings.cash_variance_threshold ? "text-red-600 font-medium" : ""}`}>
                    {Number(h.cash_variance).toLocaleString("en-KE")}
                  </td>
                  <td className="py-1.5">
                    {fmtDateTime(h.submitted_at)} {h.version > 1 && <Chip>v{h.version}</Chip>} {h.submitted_late && <Chip tone="amber">late</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
