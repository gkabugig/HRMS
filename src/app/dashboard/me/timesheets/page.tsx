import Link from "next/link";
import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, BTN_GHOST, Chip, Empty, INPUT, LABEL, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { addTimesheetEntry, deleteTimesheetEntry, submitTimesheet } from "@/lib/hub/timesheet-actions";
import { addDays, isIsoDate, sumHours, weekDays, weekStartOf } from "@/lib/hub/week";
import { nairobiNow } from "@/lib/attendance/nairobi-time";

const TONE: Record<string, "neutral" | "blue" | "green" | "red"> = { Draft: "neutral", Submitted: "blue", Approved: "green", Rejected: "red" };
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function MyTimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const { supabase, employeeId } = await pageCtx();
  if (!employeeId) return <Empty>Your login isn&apos;t linked to an employee record.</Empty>;
  const today = nairobiNow().date;
  const weekStart = week && isIsoDate(week) ? weekStartOf(week) : weekStartOf(today);

  const { data: ts } = await supabase.from("timesheets").select("id, status, total_hours").eq("employee_id", employeeId).eq("week_start", weekStart).maybeSingle();
  const { data: entries } = ts ? await supabase.from("timesheet_entries").select("id, work_date, hours, project, note").eq("timesheet_id", ts.id).order("work_date") : { data: [] };
  const { data: recent } = await supabase.from("timesheets").select("week_start, status, total_hours").eq("employee_id", employeeId).order("week_start", { ascending: false }).limit(8);
  const total = sumHours((entries ?? []).map((e) => Number(e.hours)));
  const status = (ts?.status as string | undefined) ?? "Draft";
  const editable = status === "Draft" || status === "Rejected";
  const days = weekDays(weekStart);

  return (
    <div className="space-y-6">
      <PageTitle title="My Timesheet" subtitle="Log the hours you worked each day, then send the week to your manager.">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/me/timesheets?week=${addDays(weekStart, -7)}`} className={BTN_GHOST}>← Previous week</Link>
          <span className="text-sm text-neutral-700 dark:text-neutral-200">{dayLabel(days[0])} – {dayLabel(days[6])}</span>
          <Link href={`/dashboard/me/timesheets?week=${addDays(weekStart, 7)}`} className={BTN_GHOST}>Next week →</Link>
        </div>
      </PageTitle>

      <Panel title="This week" right={<Chip tone={TONE[status]}>{status}</Chip>}>
        {status === "Rejected" && <p className="text-xs text-red-600 mb-3">Your manager sent this week back. Correct the hours and send it again.</p>}
        {(entries ?? []).length === 0 ? (
          <Empty>No hours logged for this week.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 dark:text-neutral-400 border-b border-[var(--border-subtle)]">
                <th className="py-2 pr-3 font-medium">Day</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
                <th className="py-2 pr-3 font-medium">Project or task</th>
                <th className="py-2 pr-3 font-medium">Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id as string} className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <td className="py-2 pr-3">{dayLabel(e.work_date as string)}</td>
                  <td className="py-2 pr-3 tabular-nums">{Number(e.hours)}</td>
                  <td className="py-2 pr-3">{(e.project as string) ?? "—"}</td>
                  <td className="py-2 pr-3 text-neutral-500">{(e.note as string) ?? ""}</td>
                  <td className="py-2 text-right">
                    {editable && (
                      <ActionForm action={deleteTimesheetEntry.bind(null, e.id as string)} successMessage={null} resetOnSuccess={false}>
                        <button className={BTN_DANGER}>Remove</button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 font-medium">Total</td>
                <td className="py-2 pr-3 font-medium tabular-nums">{total}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        )}
        {editable && (
          <div className="mt-4 space-y-4">
            <ActionForm action={addTimesheetEntry.bind(null, weekStart)} successMessage="Hours added." className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
              <div><label className={LABEL}>Day</label><select name="work_date" className={INPUT} defaultValue={days.includes(today) ? today : days[0]}>{days.map((d) => <option key={d} value={d} disabled={d > today}>{dayLabel(d)}</option>)}</select></div>
              <div><label className={LABEL}>Hours</label><input name="hours" type="number" step="0.25" min="0.25" max="24" required className={INPUT} /></div>
              <div><label className={LABEL}>Project or task</label><input name="project" className={INPUT} /></div>
              <div><label className={LABEL}>Note</label><input name="note" className={INPUT} /></div>
              <div><button className={BTN}>Add hours</button></div>
            </ActionForm>
            {total > 0 && (
              <ActionForm action={submitTimesheet.bind(null, weekStart)} successMessage="Sent to your manager." resetOnSuccess={false}>
                <button className={BTN}>Send week for approval ({total} h)</button>
              </ActionForm>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Recent weeks">
        {(recent ?? []).length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(recent ?? []).map((r) => (
              <li key={r.week_start as string} className="py-2 flex items-center justify-between text-sm">
                <Link href={`/dashboard/me/timesheets?week=${r.week_start}`} className="text-brand-600 underline">Week of {dayLabel(r.week_start as string)}</Link>
                <span className="flex items-center gap-3"><span className="tabular-nums">{Number(r.total_hours)} h</span><Chip tone={TONE[r.status as string]}>{r.status as string}</Chip></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
