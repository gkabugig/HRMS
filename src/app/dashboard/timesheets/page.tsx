import Link from "next/link";
import { Chip, Empty, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { addDays, weekStartOf } from "@/lib/hub/week";
import { nairobiNow } from "@/lib/attendance/nairobi-time";

const TONE: Record<string, "neutral" | "blue" | "green" | "red"> = { Draft: "neutral", Submitted: "blue", Approved: "green", Rejected: "red" };

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const { supabase, role } = await pageCtx();
  const isHr = role === "admin" || role === "hr";
  const weekStart = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? weekStartOf(week) : weekStartOf(nairobiNow().date);
  // HR sees everyone; a manager sees only their own team (the database enforces it).
  const { data } = await supabase.from("timesheets").select("id, status, total_hours, submitted_at, employees(name, staff_no, department)").eq("week_start", weekStart).order("status");
  const rows = (data ?? []) as unknown as { id: string; status: string; total_hours: number; employees: { name: string; staff_no: string; department: string } | null }[];
  const totals = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {} as Record<string, number>);
  const hours = rows.filter((r) => r.status === "Approved").reduce((s, r) => s + Number(r.total_hours), 0);

  return (
    <div className="space-y-6">
      <PageTitle title="Timesheets" subtitle={isHr ? "Weekly timesheets across the organisation." : "Weekly timesheets for your team. Approve them from My Approvals."}>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/dashboard/timesheets?week=${addDays(weekStart, -7)}`} className="text-brand-600 underline">← Previous</Link>
          <span>Week of {weekStart}</span>
          <Link href={`/dashboard/timesheets?week=${addDays(weekStart, 7)}`} className="text-brand-600 underline">Next →</Link>
        </div>
      </PageTitle>
      <Panel title="Summary">
        <div className="flex flex-wrap gap-4 text-sm text-neutral-700 dark:text-neutral-200">
          {Object.entries(totals).map(([s, n]) => (
            <span key={s}><Chip tone={TONE[s]}>{s}</Chip> <span className="ml-1">{n}</span></span>
          ))}
          <span>Approved hours: <strong>{Math.round(hours * 100) / 100}</strong></span>
        </div>
      </Panel>
      <Panel>
        {rows.length === 0 ? (
          <Empty>No timesheets for this week.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Department</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="py-2.5 pr-3">{r.employees?.name ?? "—"} <span className="text-xs text-neutral-400">{r.employees?.staff_no}</span></td>
                  <td className="py-2.5 pr-3 text-neutral-500">{r.employees?.department}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{Number(r.total_hours)}</td>
                  <td className="py-2.5"><Chip tone={TONE[r.status]}>{r.status}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
