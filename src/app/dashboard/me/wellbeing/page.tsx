import ActionForm from "@/components/forms/action-form";
import { BTN, Empty, INPUT, LABEL, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { weekStartOf } from "@/lib/hub/week";
import { submitCheckin } from "@/lib/hub/wellbeing-actions";

const MOODS = ["Struggling", "Low", "Okay", "Good", "Great"];

export default async function MyWellbeingPage() {
  const { supabase, orgId, employeeId } = await pageCtx();
  const week = weekStartOf(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }));
  const [{ data: mine }, { data: resources }] = await Promise.all([
    employeeId ? supabase.from("wellbeing_checkins").select("mood, note").eq("employee_id", employeeId).eq("week_start", week).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("wellbeing_resources").select("id, title, body, url").eq("org_id", orgId).order("created_at"),
  ]);
  return (
    <div className="space-y-6">
      <PageTitle title="Wellbeing" subtitle="A quick weekly check-in. Only you can see your answer. HR sees a combined average, and only when at least 5 people have checked in." />
      <Panel title="How are you this week?" subtitle={mine ? `You checked in: ${MOODS[(mine.mood as number) - 1]}. You can change it until Sunday.` : undefined}>
        {!employeeId ? (
          <Empty>Your login isn&apos;t linked to an employee record.</Empty>
        ) : (
          <ActionForm action={submitCheckin} successMessage="Thank you. Saved." resetOnSuccess={false} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m, i) => (
                <label key={m} className="text-xs border border-[var(--border-subtle)] rounded-lg px-3 py-2 cursor-pointer has-[:checked]:bg-brand-600 has-[:checked]:text-white">
                  <input type="radio" name="mood" value={i + 1} defaultChecked={mine?.mood === i + 1} className="sr-only" /> {m}
                </label>
              ))}
            </div>
            <div><label className={LABEL}>Anything on your mind? (private, optional)</label><textarea name="note" rows={2} defaultValue={(mine?.note as string) ?? ""} className={INPUT} /></div>
            <button className={BTN}>Save check-in</button>
          </ActionForm>
        )}
      </Panel>
      <Panel title="Support and resources">
        {(resources ?? []).length === 0 ? (
          <Empty>HR has not added any resources yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(resources ?? []).map((r) => (
              <li key={r.id as string} className="py-3 text-sm">
                <p className="font-medium text-neutral-900 dark:text-neutral-50">{r.title as string}</p>
                {r.body ? <p className="text-neutral-600 dark:text-neutral-300">{r.body as string}</p> : null}
                {r.url ? <a href={r.url as string} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Open link →</a> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
