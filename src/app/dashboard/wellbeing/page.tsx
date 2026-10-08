import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, Chip, Empty, INPUT, LABEL, PageTitle, Panel, fmtDate } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_CHECKINS, summariseWeeks } from "@/lib/hub/wellbeing";
import { addResource, assignChecklistItem, deleteResource } from "@/lib/hub/wellbeing-actions";

export default async function WellbeingHrPage() {
  const { supabase, orgId, role } = await pageCtx();
  if (!["admin", "hr"].includes(role)) return <Empty>Wellbeing results are for HR and administrators.</Empty>;
  // Check-ins are private to each person, so the combined figures are produced here on the server.
  const admin = createAdminClient();
  const [{ data: rows }, { data: resources }, { data: emps }] = await Promise.all([
    admin.from("wellbeing_checkins").select("week_start, mood").eq("org_id", orgId).order("week_start", { ascending: false }).limit(5000),
    supabase.from("wellbeing_resources").select("id, title, body, url").eq("org_id", orgId).order("created_at"),
    supabase.from("employees").select("id, name").eq("org_id", orgId).eq("status", "Active").order("name"),
  ]);
  const weeks = summariseWeeks((rows ?? []) as { week_start: string; mood: number }[]).slice(0, 8);
  return (
    <div className="space-y-6">
      <PageTitle title="Wellbeing and engagement" subtitle={`Combined weekly check-in results. An average is shown only when at least ${MIN_CHECKINS} people checked in, so no one can be identified. For opinion surveys use Surveys.`} />
      <Panel title="Weekly mood (1 = struggling, 5 = great)">
        {weeks.length === 0 ? (
          <Empty>No check-ins yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {weeks.map((w) => (
              <li key={w.weekStart} className="py-2 flex items-center justify-between text-sm">
                <span>Week of {fmtDate(w.weekStart)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">{w.count} checked in</span>
                  {w.average === null ? <Chip>Too few to show</Chip> : <Chip tone={w.average >= 4 ? "green" : w.average >= 3 ? "amber" : "red"}>{w.average} / 5</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Support and resources" subtitle="Shown to every employee on their Wellbeing page.">
          <ul className="divide-y divide-[var(--border-subtle)] mb-4">
            {(resources ?? []).map((r) => (
              <li key={r.id as string} className="py-2 flex items-center justify-between gap-2 text-sm">
                <span>{r.title as string}</span>
                <ActionForm action={deleteResource.bind(null, r.id as string)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Remove</button></ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={addResource} successMessage="Added." className="space-y-3">
            <div><label className={LABEL}>Title</label><input name="title" required className={INPUT} placeholder="Employee assistance line" /></div>
            <div><label className={LABEL}>Details</label><textarea name="body" rows={2} className={INPUT} /></div>
            <div><label className={LABEL}>Link (optional)</label><input name="url" className={INPUT} placeholder="https://" /></div>
            <button className={BTN}>Add resource</button>
          </ActionForm>
        </Panel>
        <Panel title="Give someone a task" subtitle="Appears on their My Tasks checklist and they are notified.">
          <ActionForm action={assignChecklistItem} successMessage="Task assigned." className="space-y-3">
            <div><label className={LABEL}>Task</label><input name="title" required className={INPUT} /></div>
            <div><label className={LABEL}>Due (optional)</label><input name="due_date" type="date" className={INPUT} /></div>
            <div><label className={LABEL}>Who</label>
              <select name="employee_id" className={INPUT}>
                <option value="all">Everyone</option>
                {(emps ?? []).map((e) => <option key={e.id as string} value={e.id as string}>{e.name as string}</option>)}
              </select>
            </div>
            <button className={BTN}>Assign</button>
          </ActionForm>
        </Panel>
      </div>
    </div>
  );
}
