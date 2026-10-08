import Link from "next/link";
import ActionForm from "@/components/forms/action-form";
import { BTN, BTN_DANGER, BTN_GHOST, Chip, Empty, INPUT, LABEL, PageTitle, Panel, fmtDate } from "@/components/ui/page-kit";
import { pageCtx } from "@/lib/hub/context";
import { createFromTemplate, createSurvey, deleteDraftSurvey, setSurveyStatus } from "@/lib/hub/survey-actions";

const TONE: Record<string, "neutral" | "green" | "blue"> = { Draft: "neutral", Open: "green", Closed: "blue" };

export default async function SurveysPage() {
  const { supabase, orgId, role } = await pageCtx();
  if (!["admin", "hr"].includes(role)) return <Empty>Surveys are managed by HR.</Empty>;
  const { data } = await supabase.from("surveys").select("id, title, kind, status, created_at, survey_participation(count)").eq("org_id", orgId).order("created_at", { ascending: false });
  const list = (data ?? []) as unknown as { id: string; title: string; kind: string; status: string; created_at: string; survey_participation: { count: number }[] }[];

  return (
    <div className="space-y-6">
      <PageTitle title="Surveys and wellbeing" subtitle="Anonymous pulse, engagement and wellbeing surveys. Results appear once at least 5 people have answered." />

      <Panel title="Start from a template">
        <div className="flex flex-wrap gap-2">
          {(["wellbeing", "pulse", "engagement"] as const).map((k) => (
            <ActionForm key={k} action={createFromTemplate.bind(null, k)} successMessage="Draft created." resetOnSuccess={false}>
              <button className={BTN_GHOST}>{k === "wellbeing" ? "Wellbeing check-in" : k === "pulse" ? "Quick pulse" : "Engagement survey"}</button>
            </ActionForm>
          ))}
        </div>
      </Panel>

      <Panel title="Surveys">
        {list.length === 0 ? (
          <Empty>No surveys yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {list.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/dashboard/surveys/${s.id}`} className="text-sm font-medium text-brand-600 underline">{s.title}</Link>{" "}
                  <Chip tone={TONE[s.status]}>{s.status}</Chip>
                  <p className="text-xs text-neutral-400">{s.kind} · created {fmtDate(s.created_at)} · {s.survey_participation?.[0]?.count ?? 0} responses</p>
                </div>
                <div className="flex gap-2">
                  {s.status === "Draft" && (
                    <>
                      <ActionForm action={setSurveyStatus.bind(null, s.id, "Open")} successMessage="Survey opened." resetOnSuccess={false}><button className={BTN}>Open to staff</button></ActionForm>
                      <ActionForm action={deleteDraftSurvey.bind(null, s.id)} successMessage={null} resetOnSuccess={false}><button className={BTN_DANGER}>Delete</button></ActionForm>
                    </>
                  )}
                  {s.status === "Open" && (
                    <ActionForm action={setSurveyStatus.bind(null, s.id, "Closed")} successMessage="Survey closed." resetOnSuccess={false}><button className={BTN_GHOST}>Close</button></ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Write your own" subtitle="One question per line. Start a line with “text:” for a written answer; otherwise staff rate 1 to 5.">
        <ActionForm action={createSurvey} successMessage="Draft created." className="grid grid-cols-2 gap-3">
          <div><label className={LABEL}>Title</label><input name="title" required className={INPUT} /></div>
          <div><label className={LABEL}>Type</label><select name="kind" className={INPUT}><option value="pulse">Pulse</option><option value="engagement">Engagement</option><option value="wellbeing">Wellbeing</option></select></div>
          <div className="col-span-2"><label className={LABEL}>Intro</label><input name="description" className={INPUT} /></div>
          <div className="col-span-2"><label className={LABEL}>Questions</label><textarea name="questions" rows={6} required className={INPUT} placeholder={"My workload is manageable.\ntext: What would make work easier?"} /></div>
          <div className="col-span-2"><button className={BTN}>Create draft</button></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
