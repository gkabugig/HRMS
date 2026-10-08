import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Empty, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { MIN_RESPONSES, summarise, type A, type Q } from "@/lib/hub/survey-engine";

export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, role } = await pageCtx();
  if (!["admin", "hr"].includes(role)) return <Empty>Survey results are for HR.</Empty>;
  const { data: s } = await supabase.from("surveys").select("id, title, description, status, kind").eq("id", id).eq("org_id", orgId).maybeSingle();
  if (!s) notFound();
  const [{ data: qs }, { data: answers }, { count }] = await Promise.all([
    supabase.from("survey_questions").select("id, position, prompt, qtype").eq("survey_id", id),
    supabase.from("survey_answers").select("question_id, response_key, scale_value, text_value").eq("survey_id", id),
    supabase.from("survey_participation").select("employee_id", { count: "exact", head: true }).eq("survey_id", id),
  ]);
  const sum = summarise((qs ?? []) as Q[], (answers ?? []) as A[], count ?? 0);

  return (
    <div className="space-y-6">
      <PageTitle title={s.title as string} subtitle={(s.description as string) ?? ""}>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/dashboard/surveys" className="text-brand-600 underline">← All surveys</Link>
          <Chip tone={s.status === "Open" ? "green" : "neutral"}>{s.status as string}</Chip>
          <span className="text-neutral-500">{sum.responders} {sum.responders === 1 ? "response" : "responses"}</span>
        </div>
      </PageTitle>
      {sum.hidden ? (
        <Panel><Empty>Results are hidden until at least {MIN_RESPONSES} people have responded, so no one can be identified. So far: {sum.responders}.</Empty></Panel>
      ) : (
        sum.results.map((r) => (
          <Panel key={r.id} title={r.prompt}>
            {r.qtype === "scale" ? (
              <div className="space-y-2">
                <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{r.average} <span className="text-sm font-normal text-neutral-500">out of 5 · {r.answered} answers</span></p>
                {r.counts.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                    <span className="w-4">{i + 1}</span>
                    <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden"><div className="h-full bg-brand-600" style={{ width: `${r.answered ? (n / r.answered) * 100 : 0}%` }} /></div>
                    <span className="w-6 text-right tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            ) : r.comments.length === 0 ? (
              <Empty>No written answers.</Empty>
            ) : (
              <ul className="space-y-2 text-sm text-neutral-700 dark:text-neutral-200">
                {r.comments.map((c, i) => <li key={i} className="border-l-2 border-[var(--border-subtle)] pl-3">{c}</li>)}
              </ul>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
