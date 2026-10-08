import Link from "next/link";
import { Chip, Empty, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";

export default async function MySurveysPage() {
  const { supabase, orgId, employeeId } = await pageCtx();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase.from("surveys").select("id, title, description, kind").eq("org_id", orgId).eq("status", "Open").order("created_at", { ascending: false }),
    employeeId ? supabase.from("survey_participation").select("survey_id").eq("employee_id", employeeId) : Promise.resolve({ data: [] as { survey_id: string }[] }),
  ]);
  const answered = new Set((done ?? []).map((d) => d.survey_id as string));
  return (
    <div className="space-y-6">
      <PageTitle title="Surveys" subtitle="Your answers are anonymous. HR sees only combined results, and only once enough people have answered." />
      <Panel>
        {(open ?? []).length === 0 ? (
          <Empty>No surveys are open right now.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {(open ?? []).map((s) => (
              <li key={s.id as string} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{s.title as string}</p>
                  {s.description ? <p className="text-xs text-neutral-500">{s.description as string}</p> : null}
                </div>
                {answered.has(s.id as string) ? <Chip tone="green">Answered</Chip> : <Link href={`/dashboard/me/surveys/${s.id}`} className="text-xs font-medium rounded-lg px-3 py-1.5 bg-brand-600 text-white">Answer</Link>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
