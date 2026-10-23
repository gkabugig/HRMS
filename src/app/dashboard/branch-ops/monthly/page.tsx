import Link from "next/link";
import { pageCtx, type Db } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { nairobiNow } from "@/lib/attendance/nairobi-time";
import { loadMonth } from "@/lib/branch-ops/monthly";
import { BTN_GHOST, Empty, PageTitle, Panel } from "@/components/ui/page-kit";
import OpsNav, { NotAllowed } from "../ops-nav";

export default async function MonthlyPage({ searchParams }: { searchParams: Promise<{ month?: string; branch?: string }> }) {
  const c = await pageCtx();
  if (!["admin", "hr"].includes(c.role)) return <NotAllowed />;
  const sp = await searchParams;
  const today = nairobiNow().date;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7);
  const db = createAdminClient() as Db;
  const all = await loadMonth(db, c.orgId, month, today);
  const branches = [...new Set(all.map((r) => r.branch))].sort();
  const rows = sp.branch ? all.filter((r) => r.branch === sp.branch) : all;
  const label = new Date(`${month}-01T12:00:00+03:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  const prev = new Date(`${month}-01T12:00:00+03:00`);
  prev.setMonth(prev.getMonth() - 1);
  const qs = (m: string) => `?month=${m}${sp.branch ? `&branch=${encodeURIComponent(sp.branch)}` : ""}`;

  return (
    <div className="space-y-6">
      <PageTitle title={`Monthly attendance · ${label}`} subtitle="Per person, for payroll. Hours are net of lunch breaks; overtime is time beyond the person's shift length.">
        <OpsNav current="/dashboard/branch-ops/monthly" />
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Link href={qs(prev.toISOString().slice(0, 7))} className="text-brand-600 hover:underline">
            ← Previous month
          </Link>
          {month !== today.slice(0, 7) && (
            <Link href="?" className="text-brand-600 hover:underline">
              This month
            </Link>
          )}
          <span className="text-neutral-400">|</span>
          <Link href={`?month=${month}`} className={!sp.branch ? "font-semibold" : "text-brand-600 hover:underline"}>
            All branches
          </Link>
          {branches.map((b) => (
            <Link key={b} href={`?month=${month}&branch=${encodeURIComponent(b)}`} className={sp.branch === b ? "font-semibold" : "text-brand-600 hover:underline"}>
              {b}
            </Link>
          ))}
          <a href={`/dashboard/branch-ops/monthly/export?month=${month}`} className={`${BTN_GHOST} ml-auto`}>
            Download CSV
          </a>
        </div>
      </PageTitle>

      <Panel>
        {rows.length === 0 ? (
          <Empty>No branch staff for this month.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Name</th>
                  <th className="py-1.5 pr-3 font-medium">Branch</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Days worked</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Late days</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Minutes late</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Absent</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Leave</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rest days</th>
                  <th className="py-1.5 pr-3 font-medium text-right">No clock-out</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Hours</th>
                  <th className="py-1.5 font-medium text-right">Overtime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-neutral-100 dark:border-neutral-800 tabular-nums">
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3">{r.branch}</td>
                    <td className="py-1.5 pr-3 text-right">{r.daysWorked}</td>
                    <td className={`py-1.5 pr-3 text-right ${r.lateDays ? "text-amber-700" : ""}`}>{r.lateDays}</td>
                    <td className="py-1.5 pr-3 text-right">{r.minutesLate}</td>
                    <td className={`py-1.5 pr-3 text-right ${r.absentDays ? "text-red-600" : ""}`}>{r.absentDays}</td>
                    <td className="py-1.5 pr-3 text-right">{r.leaveDays}</td>
                    <td className="py-1.5 pr-3 text-right">{r.restDays}</td>
                    <td className="py-1.5 pr-3 text-right">{r.missingClockOuts}</td>
                    <td className="py-1.5 pr-3 text-right">{r.hoursWorked}</td>
                    <td className="py-1.5 text-right">{r.overtimeHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
