import Link from "next/link";
import { getRewardContext } from "@/lib/rewards/context";
import { loadReportInput } from "@/lib/rewards/report-data";
import { REPORTS, buildReport } from "@/lib/rewards/report-engine";
import { Empty, INPUT, LABEL, PageHead, Panel } from "../ui";

type SP = { report?: string; cycle?: string; department?: string; grade?: string; manager?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, orgId, role } = await getRewardContext();
  if (role !== "admin" && role !== "hr") return <Empty>Reward reports are for HR.</Empty>;
  const key = REPORTS.some((r) => r.key === sp.report) ? sp.report! : "pools";
  const { input, options } = await loadReportInput(supabase, orgId, sp);
  const report = buildReport(key, input);
  const qs = new URLSearchParams(Object.entries({ cycle: sp.cycle, department: sp.department, grade: sp.grade, manager: sp.manager }).filter(([, v]) => v) as [string, string][]);
  const csv = `/api/rewards/reports?report=${key}${qs.toString() ? `&${qs}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHead title="Reward reports" subtitle="Standard reports, filterable by cycle, department, grade and manager. Exports are logged." role={role} current="/dashboard/rewards/reports" />
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`/dashboard/rewards/reports?report=${r.key}${qs.toString() ? `&${qs}` : ""}`} className={`text-xs rounded-full px-3 py-1.5 border ${r.key === key ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900" : "border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300"}`}>{r.title}</Link>
        ))}
        <Link href="/dashboard/rewards/fairness" className="text-xs rounded-full px-3 py-1.5 border border-[var(--border-subtle)] text-neutral-600 dark:text-neutral-300">Fairness report →</Link>
      </div>

      <form className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end" method="get">
        <input type="hidden" name="report" value={key} />
        {([["cycle", "Cycle", options.cycles.map((c) => [c.id, c.name])], ["department", "Department", options.departments.map((d) => [d, d])], ["grade", "Grade", options.grades.map((d) => [d, d])], ["manager", "Manager", options.managers.map((d) => [d, d])]] as [string, string, string[][]][]).map(([n, l, opts]) => (
          <div key={n}>
            <label className={LABEL}>{l}</label>
            <select name={n} defaultValue={(sp as Record<string, string | undefined>)[n] ?? ""} className={INPUT}>
              <option value="">All</option>
              {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        ))}
        <button className="text-xs font-medium rounded-lg px-3 py-2 bg-brand-600 text-white">Apply</button>
      </form>

      <Panel title={report.title} subtitle={report.answers} right={<a className="text-xs text-brand-600 underline" href={csv}>Export CSV</a>}>
        <div className="space-y-6">
          {report.sections.map((s) => (
            <div key={s.heading}>
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">{s.heading}</p>
              {s.rows.length === 0 ? (
                <Empty>Nothing to show for these filters.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-neutral-500">{s.columns.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {s.rows.map((row, i) => (
                        <tr key={i}>{row.map((v, j) => <td key={j} className="py-1.5 pr-3 text-neutral-900 dark:text-neutral-50 tabular-nums">{typeof v === "number" && v >= 1000 ? v.toLocaleString("en-KE") : v}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
