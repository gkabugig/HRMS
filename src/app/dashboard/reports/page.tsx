import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { REPORTS, GROUPS } from "@/lib/report-engine/catalogue";
import { kenyaToday } from "@/lib/recruitment/application";
import { presetRange } from "@/lib/report-engine/filters";

const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03]";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();
  const isHr = appUser?.role === "admin" || appUser?.role === "hr";
  const isManager = appUser?.role === "manager";
  if (!isHr && !isManager) {
    return (
      <div className={`${card} p-6 text-sm text-neutral-600 dark:text-neutral-300`}>Reports are available to HR, administrators and managers.</div>
    );
  }

  const today = kenyaToday();
  const month = presetRange("this-month", today);
  const visible = REPORTS.filter((r) => isHr || !r.hrOnly);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Reports</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Open any report to see it on screen with filters, print it, or download it as CSV or Excel.
            {isManager && " You see your own team only."}
          </p>
        </div>
        {isHr && (
          <Link href="/dashboard/analytics" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
            Looking for trends and KPIs? Workforce Analytics →
          </Link>
        )}
      </div>

      {GROUPS.map((g) => {
        const items = visible.filter((r) => r.group === g);
        if (items.length === 0) return null;
        return (
          <section key={g}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">{g}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((r) => (
                <div key={r.key} className={`${card} p-4 flex flex-col`}>
                  <Link href={`/dashboard/reports/${r.key}`} className="font-medium text-neutral-900 dark:text-neutral-50 hover:text-brand-700">
                    {r.title}
                  </Link>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 flex-1">{r.description}</p>
                  <div className="flex gap-3 mt-3 text-sm">
                    <Link href={`/dashboard/reports/${r.key}`} className="text-brand-600 hover:underline">
                      View
                    </Link>
                    <a href={`/dashboard/reports/${r.key}/export?format=csv${r.usesDates ? `&from=${month.from}&to=${month.to}` : ""}`} className="text-neutral-500 dark:text-neutral-400 hover:underline">
                      CSV
                    </a>
                    <a href={`/dashboard/reports/${r.key}/export?format=xlsx${r.usesDates ? `&from=${month.from}&to=${month.to}` : ""}`} className="text-neutral-500 dark:text-neutral-400 hover:underline">
                      Excel
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
