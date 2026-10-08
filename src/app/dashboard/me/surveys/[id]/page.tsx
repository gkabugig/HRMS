import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/forms/action-form";
import { BTN, Empty, INPUT, PageTitle, Panel } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { submitSurvey } from "@/lib/hub/survey-actions";

export default async function AnswerSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, employeeId } = await pageCtx();
  const { data: s } = await supabase.from("surveys").select("id, title, description").eq("id", id).eq("org_id", orgId).eq("status", "Open").maybeSingle();
  if (!s) notFound();
  const { data: qs } = await supabase.from("survey_questions").select("id, position, prompt, qtype").eq("survey_id", id).order("position");
  const { data: mine } = employeeId ? await supabase.from("survey_participation").select("survey_id").eq("survey_id", id).eq("employee_id", employeeId).maybeSingle() : { data: null };
  return (
    <div className="space-y-6">
      <PageTitle title={s.title as string} subtitle={(s.description as string) ?? "Your answers are anonymous."}>
        <Link href="/dashboard/me/surveys" className="text-xs text-brand-600 underline">← Surveys</Link>
      </PageTitle>
      {mine ? (
        <Panel><Empty>You have already answered this survey. Thank you.</Empty></Panel>
      ) : (
        <Panel>
          <ActionForm action={submitSurvey.bind(null, id)} successMessage="Thank you. Your answers were recorded anonymously." className="space-y-5">
            {(qs ?? []).map((q) => (
              <div key={q.id as string}>
                <p className="text-sm text-neutral-900 dark:text-neutral-50 mb-2">{q.prompt as string}</p>
                {q.qtype === "scale" ? (
                  <div className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-300">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label key={n} className="flex flex-col items-center gap-1"><input type="radio" name={`q_${q.id}`} value={n} required /> {n}</label>
                    ))}
                    <span className="self-center text-neutral-400">1 = strongly disagree · 5 = strongly agree</span>
                  </div>
                ) : (
                  <textarea name={`q_${q.id}`} rows={3} className={INPUT} placeholder="Optional" />
                )}
              </div>
            ))}
            <button className={BTN}>Submit anonymously</button>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
