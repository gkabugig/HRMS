import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { findReport } from "@/lib/report-engine/catalogue";
import { parseFilters } from "@/lib/report-engine/filters";
import { runReport } from "@/lib/report-engine/load";
import { kenyaToday } from "@/lib/recruitment/application";
import { StatGrid, BarChart, ReportTable } from "../components/report-ui";
import FilterBar from "../components/filter-bar";
import PrintButton from "../components/print-button";

const btn = "text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900 transition-colors";

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{ from?: string; to?: string; department?: string; type?: string }>;
}) {
  const { report: key } = await params;
  const q = await searchParams;
  const def = findReport(key);
  if (!def) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const isHr = appUser?.role === "admin" || appUser?.role === "hr";
  const isManager = appUser?.role === "manager";
  if (!appUser || (!isHr && !(isManager && !def.hrOnly))) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">
        This report is only available to HR and administrators.
      </div>
    );
  }

  const today = kenyaToday();
  const filters = parseFilters(q, today);
  let report;
  let failed: string | null = null;
  try {
    report = await runReport(supabase, appUser.org_id, def.key, filters, today);
  } catch (e) {
    failed = e instanceof Error ? e.message : "The report could not be built.";
  }

  const { data: deptRows } = await supabase.from("employees").select("department").eq("org_id", appUser.org_id).limit(5000);
  const departments = [...new Set((deptRows ?? []).map((d) => d.department as string))].sort();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ from: filters.from, to: filters.to, department: filters.department ?? "", type: filters.employmentType ?? "" })) {
    if (v) qs.set(k, v);
  }
  const exportBase = `/dashboard/reports/${def.key}/export?${qs.toString()}`;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href="/dashboard/reports" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← All reports
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{def.title}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{def.description}</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
            {report?.periodLabel ?? ""}
            {isManager && " · your team only"} · generated {today}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <PrintButton />
          <a href={`${exportBase}&format=csv`} className={btn}>CSV</a>
          <a href={`${exportBase}&format=xlsx`} className={btn}>Excel</a>
        </div>
      </div>

      <FilterBar def={def} filters={filters} today={today} departments={departments} />

      {failed && <p role="alert" className="text-sm text-red-600">Couldn&apos;t build this report: {failed}</p>}
      {report && (
        <>
          <StatGrid stats={report.stats} />
          {report.chart && <BarChart chart={report.chart} />}
          <ReportTable report={report} />
          {report.notes.length > 0 && (
            <ul className="text-xs text-neutral-500 dark:text-neutral-400 space-y-1 list-disc pl-4">
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {def.analyticsView && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 print:hidden">
              Want the trend over time?{" "}
              <Link href={`/dashboard/analytics?view=${def.analyticsView}`} className="text-brand-600 hover:underline">
                Open the matching Workforce Analytics dashboard
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
