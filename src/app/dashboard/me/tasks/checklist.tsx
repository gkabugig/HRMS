import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, Chip, Empty, INPUT, LABEL, Panel, fmtDate } from "@/components/ui/page-kit";
import { addChecklistItem, deleteChecklistItem, toggleChecklistItem } from "@/lib/hub/wellbeing-actions";
import type { Db } from "@/lib/hub/context";

type Item = { id: string; title: string; due_date: string | null; done_at: string | null; assigned_by: string | null };

export default async function Checklist({ supabase, employeeId }: { supabase: Db; employeeId: string }) {
  const { data } = await supabase.from("checklist_items").select("id, title, due_date, done_at, assigned_by").eq("employee_id", employeeId).order("created_at", { ascending: false }).limit(200);
  const items = (data ?? []) as Item[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  const open = items.filter((i) => !i.done_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const done = items.filter((i) => i.done_at).slice(0, 10);
  return (
    <Panel title="My checklist" subtitle="Your own to-dos, and tasks HR has given you.">
      <ActionForm action={addChecklistItem} successMessage={null} className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex-1 min-w-48"><label className={LABEL}>New task</label><input name="title" required className={INPUT} /></div>
        <div><label className={LABEL}>Due (optional)</label><input name="due_date" type="date" className={INPUT} /></div>
        <button className={BTN}>Add</button>
      </ActionForm>
      {open.length === 0 && done.length === 0 ? (
        <Empty>Nothing on your list.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {[...open, ...done].map((i) => (
            <li key={i.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-3">
                <ActionForm action={toggleChecklistItem.bind(null, i.id, !i.done_at)} successMessage={null} resetOnSuccess={false}>
                  <button className="h-5 w-5 rounded border border-neutral-300 flex items-center justify-center text-xs" aria-label={i.done_at ? "Mark not done" : "Mark done"}>{i.done_at ? "✓" : ""}</button>
                </ActionForm>
                <span className={i.done_at ? "line-through text-neutral-400" : "text-neutral-900 dark:text-neutral-50"}>{i.title}</span>
                {i.assigned_by && <Chip tone="blue">From HR</Chip>}
                {i.due_date && !i.done_at && <Chip tone={i.due_date < today ? "red" : "neutral"}>Due {fmtDate(i.due_date)}</Chip>}
              </div>
              {!i.assigned_by && (
                <ActionForm action={deleteChecklistItem.bind(null, i.id)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Delete</button></ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
