import ActionForm from "@/components/forms/action-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { addCandidate, updateRequisitionAd, setRequisitionPublished, decideRequisition } from "../actions";
import MoveCandidateForm from "../components/move-candidate-form";
import { BOARD_STAGES } from "@/lib/recruitment/stages";

const input = "border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2";
const card = "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03]";

type Cand = {
  id: string;
  name: string;
  source: string | null;
  stage: string;
  email: string | null;
  applied_via: string;
  rejection_reason: string | null;
  stage_changed_at: string;
  added_on: string;
};

export default async function RequisitionDetailPage({ params }: { params: Promise<{ requisitionId: string }> }) {
  const { requisitionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();
  const canEdit = appUser?.role === "admin" || appUser?.role === "hr";

  const [{ data: requisition }, { data: candidates }] = await Promise.all([
    supabase.from("requisitions").select("*, employees(name)").eq("id", requisitionId).single(),
    supabase
      .from("candidates")
      .select("id, name, source, stage, email, applied_via, rejection_reason, stage_changed_at, added_on")
      .eq("requisition_id", requisitionId)
      .order("added_on", { ascending: false }),
  ]);

  if (!requisition) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Requisition not found.</p>;
  }

  const all = (candidates ?? []) as Cand[];
  const rejected = all.filter((c) => c.stage === "Rejected");
  const approved = requisition.approval_status === "Approved";
  const open = requisition.status === "Open";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/recruitment" className="text-sm text-brand-600 hover:text-brand-700 hover:underline">
          ← All requisitions
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mt-1">
          {requisition.role} — {requisition.department}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Headcount {requisition.headcount} · Hiring manager: {(requisition.employees as unknown as { name: string } | null)?.name ?? "—"} · {requisition.status}
          {requisition.closing_date && ` · applications close ${requisition.closing_date}`}
        </p>
      </div>

      {!approved && (
        <div className={`${card} p-4 text-sm`}>
          <p className="font-medium">{requisition.approval_status === "Pending" ? "This hiring request is waiting for HR approval." : "This hiring request was declined."}</p>
          {requisition.approval_note && <p className="text-neutral-500 dark:text-neutral-400 mt-1">Note: {requisition.approval_note}</p>}
          {canEdit && requisition.approval_status === "Pending" && (
            <ActionForm action={decideRequisition.bind(null, requisition.id, "Approved")} className="mt-3" successMessage={null}>
              <button className="text-sm bg-green-700 hover:bg-green-800 text-white rounded-lg px-3 py-1.5">Approve</button>
            </ActionForm>
          )}
        </div>
      )}

      {canEdit && approved && (
        <details className={`${card} p-4 text-sm`}>
          <summary className="cursor-pointer font-medium text-neutral-900 dark:text-neutral-50">
            Job advert {requisition.published ? "· published on the careers page" : "· not published"}
          </summary>
          <ActionForm action={updateRequisitionAd.bind(null, requisition.id)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3" resetOnSuccess={false}>
            <input name="location" defaultValue={requisition.location ?? ""} placeholder="Location" className={input} />
            <select name="employment_type" defaultValue={requisition.employment_type} className={input} aria-label="Employment type">
              {["Permanent", "Contract", "Casual", "Intern"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input name="closing_date" type="date" defaultValue={requisition.closing_date ?? ""} className={input} aria-label="Closing date" />
            <textarea name="description" rows={4} defaultValue={requisition.description ?? ""} placeholder="Job description" className={`${input} sm:col-span-3`} />
            <textarea name="requirements" rows={4} defaultValue={requisition.requirements ?? ""} placeholder="Requirements" className={`${input} sm:col-span-3`} />
            <button className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 font-medium">Save advert</button>
          </ActionForm>
          {open && (
            <ActionForm action={setRequisitionPublished.bind(null, requisition.id, !requisition.published)} className="mt-3" successMessage={null}>
              <button className="text-sm border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 hover:border-brand-300">
                {requisition.published ? "Take off the careers page" : "Publish on the careers page"}
              </button>
              {requisition.published && appUser?.org_id && (
                <Link href={`/careers/${appUser.org_id}/${requisition.id}`} target="_blank" className="ml-3 text-brand-600 hover:underline">
                  View public advert ↗
                </Link>
              )}
            </ActionForm>
          )}
        </details>
      )}

      {approved && (
        <div className="overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[minmax(13rem,1fr)] gap-3 min-w-max sm:min-w-0">
            {BOARD_STAGES.map((stage) => {
              const inStage = all.filter((c) => c.stage === stage);
              return (
                <div key={stage} className="bg-neutral-50 dark:bg-neutral-900 rounded-xl p-2 min-h-24">
                  <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 px-1 pb-2 flex justify-between">
                    <span>{stage}</span>
                    <span className="text-neutral-400">{inStage.length}</span>
                  </p>
                  <div className="space-y-2">
                    {inStage.map((c) => (
                      <div key={c.id} className={`${card} p-2.5 text-sm`}>
                        <Link href={`/dashboard/recruitment/${requisitionId}/${c.id}`} className="font-medium text-brand-600 hover:text-brand-700 hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {c.applied_via === "careers" ? "Careers page" : c.source ?? "Added by HR"}
                        </p>
                        {canEdit && stage !== "Hired" && (
                          <div className="mt-2">
                            <MoveCandidateForm candidateId={c.id} requisitionId={requisitionId} stage={c.stage} />
                          </div>
                        )}
                      </div>
                    ))}
                    {inStage.length === 0 && <p className="text-xs text-neutral-400 px-1">Nobody here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rejected.length > 0 && (
        <details className={`${card} p-4 text-sm`}>
          <summary className="cursor-pointer font-medium">Rejected ({rejected.length})</summary>
          <ul className="mt-3 space-y-2">
            {rejected.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/dashboard/recruitment/${requisitionId}/${c.id}`} className="text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-neutral-500 dark:text-neutral-400"> — {c.rejection_reason ?? "no reason recorded"}</span>
                </span>
                {canEdit && <MoveCandidateForm candidateId={c.id} requisitionId={requisitionId} stage={c.stage} />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {canEdit && approved && open && (
        <div className={`${card} p-4`}>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Add candidate</h2>
          <ActionForm action={addCandidate.bind(null, requisitionId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="name" placeholder="Candidate name" required className={input} />
            <input name="email" type="email" placeholder="Email" className={input} />
            <input name="phone" placeholder="Phone" className={input} />
            <input name="source" placeholder="Source (referral, job board...)" className={input} />
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 sm:col-span-2">
              CV (PDF or Word, up to 5 MB)
              <input name="cv" type="file" accept=".pdf,.doc,.docx" className="text-xs" />
            </label>
            <textarea name="notes" rows={2} placeholder="Notes" className={`${input} sm:col-span-3`} />
            <button type="submit" className="sm:col-span-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Add candidate
            </button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
