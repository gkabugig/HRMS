import ActionForm from "@/components/forms/action-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  updateCandidateDetails,
  scheduleInterview,
  setInterviewStatus,
  submitScorecard,
  saveOffer,
  setOfferStatus,
  hireCandidate,
  addOnboardingTask,
  toggleOnboardingTask,
} from "../../actions";
import MoveCandidateForm from "../../components/move-candidate-form";
import { summariseScorecards, cardAverage, RECOMMENDATIONS, type Scorecard } from "@/lib/recruitment/scorecard";
import { candidateEmailDraft, mailtoLink } from "@/lib/recruitment/email-draft";

const input = "border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2";
const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4";
const h2 = "text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(iso));

type CardRow = Scorecard & { id: string; interviewer_id: string; notes: string | null };

export default async function CandidatePage({ params }: { params: Promise<{ requisitionId: string; candidateId: string }> }) {
  const { requisitionId, candidateId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const canEdit = appUser?.role === "admin" || appUser?.role === "hr";
  const canScore = canEdit || appUser?.role === "manager";

  const [{ data: candidate }, { data: requisition }] = await Promise.all([
    supabase.from("candidates").select("*, onboarding_tasks(id, task, done)").eq("id", candidateId).eq("requisition_id", requisitionId).maybeSingle(),
    supabase.from("requisitions").select("role, department, hiring_manager_id").eq("id", requisitionId).maybeSingle(),
  ]);
  if (!candidate || !requisition) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Candidate not found.</p>;
  }

  const [{ data: history }, { data: interviews }, { data: cards }, { data: offers }, { data: org }, { data: panelUsers }] = await Promise.all([
    supabase.from("candidate_stage_history").select("id, from_stage, to_stage, reason, changed_at").eq("candidate_id", candidateId).order("changed_at"),
    supabase.from("candidate_interviews").select("id, scheduled_at, mode, location, notes, status, panel_user_ids").eq("candidate_id", candidateId).order("scheduled_at"),
    supabase.from("interview_scorecards").select("id, interviewer_id, skills, experience, communication, culture_fit, recommendation, notes").eq("candidate_id", candidateId),
    canEdit
      ? supabase.from("candidate_offers").select("id, salary, start_date, terms, status, sent_on, responded_on").eq("candidate_id", candidateId).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    supabase.from("organizations").select("name").eq("id", appUser!.org_id).maybeSingle(),
    canEdit
      ? supabase
          .from("app_users")
          .select("id, role, employee_id, employees(name)")
          .eq("org_id", appUser!.org_id)
          .or(`role.in.(admin,hr)${requisition.hiring_manager_id ? `,employee_id.eq.${requisition.hiring_manager_id}` : ""}`)
      : Promise.resolve({ data: null }),
  ]);

  // Names for interviewers (scorecards) — best effort; falls back to a label.
  const interviewerIds = [...new Set((cards ?? []).map((c) => c.interviewer_id as string))];
  const { data: interviewerUsers } = interviewerIds.length
    ? await supabase.from("app_users").select("id, employees(name)").in("id", interviewerIds)
    : { data: [] as { id: string; employees: unknown }[] };
  const nameOf = (id: string) => {
    const u = (interviewerUsers ?? []).find((x) => x.id === id) ?? (panelUsers ?? []).find((x) => x.id === id);
    return (u?.employees as unknown as { name: string } | null)?.name ?? (id === user!.id ? "You" : "Panel member");
  };

  let cvUrl: string | null = null;
  if (candidate.cv_path) {
    const { data } = await supabase.storage.from("candidate-cvs").createSignedUrl(candidate.cv_path, 3600);
    cvUrl = data?.signedUrl ?? null;
  }

  const cardRows = (cards ?? []) as CardRow[];
  const summary = summariseScorecards(cardRows);
  const mine = cardRows.find((c) => c.interviewer_id === user!.id);
  const offer = offers?.[0] ?? null;
  const draft = candidate.email
    ? mailtoLink(candidate.email, candidateEmailDraft({ stage: candidate.stage, name: candidate.name, role: requisition.role, orgName: org?.name }))
    : null;
  const tasks = (candidate.onboarding_tasks ?? []) as { id: string; task: string; done: boolean }[];
  const base = `/dashboard/recruitment/${requisitionId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={base} className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← {requisition.role} pipeline
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{candidate.name}</h1>
          <span className="text-xs uppercase tracking-wide bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded">{candidate.stage}</span>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {candidate.applied_via === "careers" ? "Applied on the careers page" : `Added by HR${candidate.source ? ` via ${candidate.source}` : ""}`}
          {candidate.rejection_reason && ` · Rejected: ${candidate.rejection_reason}`}
        </p>
        {canEdit && candidate.stage !== "Hired" && (
          <div className="mt-3">
            <MoveCandidateForm candidateId={candidateId} requisitionId={requisitionId} stage={candidate.stage} />
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className={h2}>Details</h2>
        <div className="text-sm text-neutral-700 dark:text-neutral-200 space-y-1 mb-3">
          <p>Email: {candidate.email ?? "—"} · Phone: {candidate.phone ?? "—"}</p>
          <p>
            CV:{" "}
            {cvUrl ? (
              <a href={cvUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                Open CV ↗
              </a>
            ) : (
              "none uploaded"
            )}
          </p>
          {candidate.notes && <p className="text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">{candidate.notes}</p>}
          {draft && (
            <p>
              <a href={draft} className="text-brand-600 hover:underline">
                Write an email to {candidate.name.split(" ")[0]} ↗
              </a>{" "}
              <span className="text-xs text-neutral-400">(opens your mail app with a draft for the current stage)</span>
            </p>
          )}
        </div>
        {canEdit && (
          <details>
            <summary className="text-sm text-brand-600 cursor-pointer">Edit details or upload a CV</summary>
            <ActionForm action={updateCandidateDetails.bind(null, candidateId, requisitionId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3" resetOnSuccess={false}>
              <input name="name" defaultValue={candidate.name} required className={input} />
              <input name="email" type="email" defaultValue={candidate.email ?? ""} placeholder="Email" className={input} />
              <input name="phone" defaultValue={candidate.phone ?? ""} placeholder="Phone" className={input} />
              <input name="source" defaultValue={candidate.source ?? ""} placeholder="Source" className={input} />
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                New CV (PDF/Word, up to 5 MB)
                <input name="cv" type="file" accept=".pdf,.doc,.docx" className="text-xs" />
              </label>
              <textarea name="notes" rows={3} defaultValue={candidate.notes ?? ""} placeholder="Notes" className={`${input} sm:col-span-3`} />
              <button className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium">Save details</button>
            </ActionForm>
          </details>
        )}
      </div>

      <div className={card}>
        <h2 className={h2}>Interviews</h2>
        <ul className="space-y-2 text-sm mb-3">
          {(interviews ?? []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {fmt(i.scheduled_at)} · {i.mode}
                {i.location ? ` · ${i.location}` : ""} <span className="text-xs text-neutral-500">({i.status})</span>
                {i.notes && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{i.notes}</span>}
              </span>
              {canEdit && i.status === "Scheduled" && (
                <span className="flex gap-3 text-xs">
                  <ActionForm action={setInterviewStatus.bind(null, i.id, "Completed", candidateId, requisitionId)} successMessage={null}>
                    <button className="text-green-700 hover:underline">Mark done</button>
                  </ActionForm>
                  <ActionForm action={setInterviewStatus.bind(null, i.id, "Cancelled", candidateId, requisitionId)} successMessage={null}>
                    <button className="text-neutral-500 hover:underline">Cancel</button>
                  </ActionForm>
                </span>
              )}
            </li>
          ))}
          {(interviews ?? []).length === 0 && <li className="text-neutral-400 dark:text-neutral-500">No interviews scheduled.</li>}
        </ul>
        {canEdit && candidate.stage !== "Hired" && candidate.stage !== "Rejected" && (
          <details>
            <summary className="text-sm text-brand-600 cursor-pointer">Schedule an interview</summary>
            <ActionForm action={scheduleInterview.bind(null, candidateId, requisitionId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3">
              <input name="scheduled_at" type="datetime-local" required className={input} aria-label="Date and time (Kenya time)" />
              <select name="mode" className={input} aria-label="Mode">
                {["In person", "Video call", "Phone"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input name="location" placeholder="Venue or meeting link" className={input} />
              <fieldset className="sm:col-span-3 text-xs">
                <legend className="text-neutral-600 dark:text-neutral-300 mb-1">Panel (they will be notified)</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {(panelUsers ?? []).map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5">
                      <input type="checkbox" name="panel" value={p.id} />
                      {(p.employees as unknown as { name: string } | null)?.name ?? (p.role === "hr" ? "HR" : "Admin")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <input name="notes" placeholder="Notes for the panel" className={`${input} sm:col-span-3`} />
              <button className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium">Schedule</button>
            </ActionForm>
          </details>
        )}
      </div>

      <div className={card}>
        <h2 className={h2}>Scorecards</h2>
        {summary.count > 0 && (
          <p className="text-sm mb-3">
            Panel average <span className="font-semibold">{summary.average}/5</span> from {summary.count} scorecard{summary.count === 1 ? "" : "s"} ·{" "}
            {RECOMMENDATIONS.filter((r) => summary.recommendations[r] > 0).map((r) => `${summary.recommendations[r]} ${r}`).join(", ")}
          </p>
        )}
        <ul className="space-y-2 text-sm mb-3">
          {cardRows.map((c) => (
            <li key={c.id} className="border-t border-neutral-100 dark:border-neutral-800 pt-2">
              <span className="font-medium">{nameOf(c.interviewer_id)}</span> — {cardAverage(c)}/5 · {c.recommendation}
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                Skills {c.skills} · Experience {c.experience} · Communication {c.communication} · Culture fit {c.culture_fit}
              </span>
              {c.notes && <span className="block text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">{c.notes}</span>}
            </li>
          ))}
          {cardRows.length === 0 && <li className="text-neutral-400 dark:text-neutral-500">No scorecards yet.</li>}
        </ul>
        {canScore && (
          <details>
            <summary className="text-sm text-brand-600 cursor-pointer">{mine ? "Update my scorecard" : "Add my scorecard"}</summary>
            <ActionForm action={submitScorecard.bind(null, candidateId, requisitionId)} className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3" successMessage="Scorecard saved." resetOnSuccess={false}>
              {(
                [
                  ["skills", "Skills"],
                  ["experience", "Experience"],
                  ["communication", "Communication"],
                  ["culture_fit", "Culture fit"],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="block text-xs text-neutral-600 dark:text-neutral-300">
                  {label} (1–5)
                  <select name={name} defaultValue={mine ? String(mine[name]) : ""} required className={`${input} mt-1 w-full`}>
                    <option value="">Score…</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="block text-xs text-neutral-600 dark:text-neutral-300 col-span-2 sm:col-span-4">
                Overall recommendation
                <select name="recommendation" defaultValue={mine?.recommendation ?? ""} required className={`${input} mt-1 w-full`}>
                  <option value="">Choose…</option>
                  {RECOMMENDATIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <textarea name="notes" rows={3} defaultValue={mine?.notes ?? ""} placeholder="Notes: strengths, concerns, evidence" className={`${input} col-span-2 sm:col-span-4`} />
              <button className="col-span-2 sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium">Save scorecard</button>
            </ActionForm>
          </details>
        )}
      </div>

      {canEdit && (candidate.stage === "Shortlisted" || candidate.stage === "Interviewed" || candidate.stage === "Offered" || candidate.stage === "Hired" || offer) && (
        <div className={card}>
          <h2 className={h2}>Offer</h2>
          {offer && (
            <p className="text-sm mb-3">
              {offer.status}
              {offer.salary != null && ` · KES ${Number(offer.salary).toLocaleString("en-KE")}`}
              {offer.start_date && ` · starts ${offer.start_date}`}
              {offer.sent_on && ` · sent ${offer.sent_on}`}
              {offer.responded_on && ` · replied ${offer.responded_on}`}
              {offer.terms && <span className="block text-xs text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">{offer.terms}</span>}
            </p>
          )}
          {offer && (offer.status === "Draft" || offer.status === "Sent") && (
            <div className="flex flex-wrap gap-3 mb-3 text-xs">
              {offer.status === "Draft" && (
                <ActionForm action={setOfferStatus.bind(null, offer.id, "Sent", candidateId, requisitionId)} successMessage={null}>
                  <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1">Mark as sent (moves to Offered)</button>
                </ActionForm>
              )}
              {offer.status === "Sent" && (
                <>
                  <ActionForm action={setOfferStatus.bind(null, offer.id, "Accepted", candidateId, requisitionId)} successMessage={null}>
                    <button className="bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-1">They accepted</button>
                  </ActionForm>
                  <ActionForm action={setOfferStatus.bind(null, offer.id, "Declined", candidateId, requisitionId)} successMessage={null}>
                    <button className="bg-neutral-200 dark:bg-neutral-700 rounded-lg px-3 py-1">They declined</button>
                  </ActionForm>
                </>
              )}
              <ActionForm action={setOfferStatus.bind(null, offer.id, "Withdrawn", candidateId, requisitionId)} successMessage={null}>
                <button className="text-neutral-500 underline">Withdraw offer</button>
              </ActionForm>
            </div>
          )}
          {candidate.stage !== "Hired" && candidate.stage !== "Rejected" && (!offer || offer.status === "Draft" || offer.status === "Sent" || offer.status === "Declined" || offer.status === "Withdrawn") && (
            <details>
              <summary className="text-sm text-brand-600 cursor-pointer">{offer && (offer.status === "Draft" || offer.status === "Sent") ? "Edit offer" : "Draft an offer"}</summary>
              <ActionForm action={saveOffer.bind(null, candidateId, requisitionId)} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3" resetOnSuccess={false}>
                <input name="salary" type="number" min={0} step="0.01" defaultValue={offer?.salary ?? ""} placeholder="Monthly gross salary (KES)" className={input} />
                <input name="start_date" type="date" defaultValue={offer?.start_date ?? ""} className={input} aria-label="Start date" />
                <textarea name="terms" rows={3} defaultValue={offer?.terms ?? ""} placeholder="Terms and conditions" className={`${input} sm:col-span-2`} />
                <button className="sm:col-span-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium">Save offer</button>
              </ActionForm>
            </details>
          )}
          {candidate.stage === "Offered" && (!offer || offer.status === "Accepted") && (
            <ActionForm action={hireCandidate.bind(null, candidateId, requisitionId)} className="mt-3" successMessage={null}>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Creates an employee record for {candidate.name} in {requisition.department} as {requisition.role}
                {offer?.start_date ? `, starting ${offer.start_date}` : ""}. Staff number, compensation, branch and the rest are filled in on the Employees page right after.
              </p>
              <button type="submit" className="text-sm bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-1.5 font-medium">
                Hire → create employee record
              </button>
            </ActionForm>
          )}
        </div>
      )}

      {(candidate.stage === "Offered" || candidate.stage === "Hired") && (
        <div className={card}>
          <h2 className={h2}>Onboarding checklist</h2>
          <ul className="space-y-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                {canEdit ? (
                  <ActionForm action={toggleOnboardingTask.bind(null, t.id, requisitionId, !t.done)} successMessage={null}>
                    <button type="submit" className={t.done ? "text-green-600" : "text-neutral-400 dark:text-neutral-500"} aria-label={t.done ? "Mark not done" : "Mark done"}>
                      {t.done ? "☑" : "☐"}
                    </button>
                  </ActionForm>
                ) : (
                  <span>{t.done ? "☑" : "☐"}</span>
                )}
                <span className={t.done ? "line-through text-neutral-400 dark:text-neutral-500" : ""}>{t.task}</span>
              </li>
            ))}
          </ul>
          {canEdit && (
            <ActionForm action={addOnboardingTask.bind(null, candidateId, requisitionId)} className="mt-2 flex gap-2 text-sm">
              <input name="task" placeholder="Add a task…" required className={`${input} flex-1 py-1 px-2`} />
              <button type="submit" className="text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1">
                Add
              </button>
            </ActionForm>
          )}
        </div>
      )}

      <div className={card}>
        <h2 className={h2}>History</h2>
        <ol className="space-y-1.5 text-sm">
          {(history ?? []).map((h) => (
            <li key={h.id} className="text-neutral-700 dark:text-neutral-200">
              <span className="text-xs text-neutral-400 mr-2">{fmt(h.changed_at)}</span>
              {h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Entered as ${h.to_stage}`}
              {h.reason && <span className="text-neutral-500 dark:text-neutral-400"> — {h.reason}</span>}
            </li>
          ))}
          {(history ?? []).length === 0 && <li className="text-neutral-400">No history yet.</li>}
        </ol>
      </div>
    </div>
  );
}
