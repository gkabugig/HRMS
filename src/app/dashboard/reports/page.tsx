import { createClient } from "@/lib/supabase/server";
import { Download } from "lucide-react";
import {
  countBy,
  sumBy,
  currentYearRange,
  daysAgo,
  daysBetween,
  isLateClockIn,
} from "@/lib/reports";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { start: yearStart, end: yearEnd } = currentYearRange();
  const since30 = daysAgo(30);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: payrollRuns },
    { data: leaveRows },
    { data: attendanceRows },
    { data: complianceDocs },
    { data: disciplinaryRows },
    { data: offboardingRows },
    { data: requisitions },
    { data: candidates },
  ] = await Promise.all([
    supabase.from("employees").select("id, department, employment_type, status"),
    supabase.from("payroll_runs").select("id, period").order("generated_at", { ascending: false }).limit(12),
    supabase
      .from("leave_requests")
      .select("leave_type, status, days")
      .gte("start_date", yearStart)
      .lte("start_date", yearEnd),
    supabase.from("attendance").select("employee_id, clock_in, clock_out").gte("work_date", since30),
    supabase.from("compliance_documents").select("expiry_date, alert_threshold_days"),
    supabase
      .from("disciplinary_actions")
      .select("action_type")
      .gte("hearing_date", yearStart)
      .lte("hearing_date", yearEnd),
    supabase
      .from("offboarding_records")
      .select("exit_type, severance_pay")
      .gte("notice_date", yearStart)
      .lte("notice_date", yearEnd),
    supabase.from("requisitions").select("status"),
    supabase.from("candidates").select("stage"),
  ]);

  const runIds = (payrollRuns ?? []).map((r) => r.id);
  const { data: payslips } =
    runIds.length > 0
      ? await supabase
          .from("payslips")
          .select("payroll_run_id, gross, net, nssf, shif, housing_levy, paye")
          .in("payroll_run_id", runIds)
      : { data: [] as { payroll_run_id: string; gross: number; net: number; nssf: number; shif: number; housing_levy: number; paye: number }[] };

  const periodById = new Map((payrollRuns ?? []).map((r) => [r.id, r.period]));
  const payrollByPeriod = new Map<string, { gross: number; net: number; statutory: number }>();
  for (const p of payslips ?? []) {
    const period = periodById.get(p.payroll_run_id) ?? "—";
    const agg = payrollByPeriod.get(period) ?? { gross: 0, net: 0, statutory: 0 };
    agg.gross += p.gross;
    agg.net += p.net;
    agg.statutory += p.nssf + p.shif + p.housing_levy + p.paye;
    payrollByPeriod.set(period, agg);
  }
  const payrollTrend = Array.from(payrollByPeriod.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 6);

  const activeEmployees = (employees ?? []).filter((e) => e.status === "Active");
  const byDepartment = countBy(activeEmployees, (e) => e.department);
  const byEmploymentType = countBy(activeEmployees, (e) => e.employment_type);

  const leaveByType = countBy(leaveRows ?? [], (l) => l.leave_type);
  const leaveDaysByType: Record<string, number> = {};
  for (const l of leaveRows ?? []) {
    if (l.status !== "Approved") continue;
    leaveDaysByType[l.leave_type] = (leaveDaysByType[l.leave_type] ?? 0) + l.days;
  }
  const pendingLeave = (leaveRows ?? []).filter((l) => l.status === "Pending").length;

  const lateCount = (attendanceRows ?? []).filter((a) => isLateClockIn(a.clock_in)).length;
  const missingClockOutCount = (attendanceRows ?? []).filter((a) => a.clock_in && !a.clock_out).length;

  const expiredDocs = (complianceDocs ?? []).filter((c) => daysBetween(today, c.expiry_date) < 0).length;
  const expiringSoonDocs = (complianceDocs ?? []).filter((c) => {
    const d = daysBetween(today, c.expiry_date);
    return d >= 0 && d <= c.alert_threshold_days;
  }).length;

  const disciplinaryByType = countBy(disciplinaryRows ?? [], (d) => d.action_type);
  const offboardingByType = countBy(offboardingRows ?? [], (o) => o.exit_type);
  const totalSeverance = sumBy(offboardingRows ?? [], (o) => o.severance_pay ?? 0);

  const openReqs = (requisitions ?? []).filter((r) => r.status === "Open").length;
  const candidatesByStage = countBy(candidates ?? [], (c) => c.stage);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Reports</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          A snapshot of workforce, payroll, leave, attendance, and compliance — each section
          exports to CSV for further analysis or board packs.
        </p>
      </div>

      <ReportSection
        title="Workforce"
        subtitle={`${activeEmployees.length} active employee${activeEmployees.length === 1 ? "" : "s"}`}
        exportHref="/dashboard/reports/export/headcount"
      >
        <BreakdownGrid title="By department" counts={byDepartment} />
        <BreakdownGrid title="By employment type" counts={byEmploymentType} />
      </ReportSection>

      <ReportSection
        title="Payroll"
        subtitle="Last 6 runs — gross, net, and total statutory deductions"
        exportHref="/dashboard/reports/export/payroll"
      >
        {payrollTrend.length === 0 ? (
          <EmptyNote text="No payroll runs yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
                <th className="py-1.5 font-medium">Period</th>
                <th className="py-1.5 font-medium text-right">Gross</th>
                <th className="py-1.5 font-medium text-right">Statutory</th>
                <th className="py-1.5 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {payrollTrend.map(([period, agg]) => (
                <tr key={period} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="py-1.5">{period}</td>
                  <td className="py-1.5 text-right">{formatKes(agg.gross)}</td>
                  <td className="py-1.5 text-right">{formatKes(agg.statutory)}</td>
                  <td className="py-1.5 text-right font-medium">{formatKes(agg.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        title="Leave"
        subtitle={`This year — ${pendingLeave} request${pendingLeave === 1 ? "" : "s"} pending`}
        exportHref="/dashboard/reports/export/leave"
      >
        <BreakdownGrid title="Requests by type" counts={leaveByType} />
        <BreakdownGrid title="Approved days by type" counts={leaveDaysByType} />
      </ReportSection>

      <ReportSection
        title="Attendance"
        subtitle="Trailing 30 days"
        exportHref="/dashboard/reports/export/attendance"
      >
        <StatRow
          stats={[
            { label: "Records", value: (attendanceRows ?? []).length },
            { label: "Late arrivals", value: lateCount },
            { label: "Missing clock-outs", value: missingClockOutCount },
          ]}
        />
      </ReportSection>

      <ReportSection
        title="Compliance"
        subtitle="Document expiry status"
        exportHref="/dashboard/reports/export/compliance"
      >
        <StatRow
          stats={[
            { label: "Tracked documents", value: (complianceDocs ?? []).length },
            { label: "Expiring soon", value: expiringSoonDocs, tone: "amber" },
            { label: "Expired", value: expiredDocs, tone: "red" },
          ]}
        />
      </ReportSection>

      <ReportSection
        title="Disciplinary & offboarding"
        subtitle={`This year — ${formatKes(totalSeverance)} in severance pay`}
        exportHref="/dashboard/reports/export/disciplinary"
        exportLabel="Disciplinary CSV"
        secondExportHref="/dashboard/reports/export/offboarding"
        secondExportLabel="Offboarding CSV"
      >
        <BreakdownGrid title="Disciplinary actions by type" counts={disciplinaryByType} />
        <BreakdownGrid title="Exits by type" counts={offboardingByType} />
      </ReportSection>

      <ReportSection
        title="Recruitment"
        subtitle={`${openReqs} open requisition${openReqs === 1 ? "" : "s"}`}
        exportHref="/dashboard/reports/export/recruitment"
      >
        <BreakdownGrid title="Candidates by stage" counts={candidatesByStage} />
      </ReportSection>
    </div>
  );
}

function formatKes(n: number) {
  return `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function ReportSection({
  title,
  subtitle,
  exportHref,
  exportLabel = "Export CSV",
  secondExportHref,
  secondExportLabel,
  children,
}: {
  title: string;
  subtitle: string;
  exportHref: string;
  exportLabel?: string;
  secondExportHref?: string;
  secondExportLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{title}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Download size={14} /> {exportLabel}
          </a>
          {secondExportHref && (
            <a
              href={secondExportHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Download size={14} /> {secondExportLabel}
            </a>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">{children}</div>
    </div>
  );
}

function BreakdownGrid({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-2">{title}</p>
      {entries.length === 0 ? (
        <EmptyNote text="No data yet." />
      ) : (
        <ul className="space-y-1">
          {entries.map(([label, value]) => (
            <li key={label} className="flex items-center justify-between text-sm">
              <span className="text-neutral-700 dark:text-neutral-200">{label}</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-50">{value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatRow({
  stats,
}: {
  stats: { label: string; value: number; tone?: "amber" | "red" }[];
}) {
  return (
    <div className="sm:col-span-2 grid grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label}>
          <div
            className={`text-2xl font-semibold ${
              s.tone === "red" ? "text-red-600" : s.tone === "amber" ? "text-amber-600" : "text-neutral-900 dark:text-neutral-50"
            }`}
          >
            {s.value}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs text-neutral-400 dark:text-neutral-500">{text}</p>;
}
