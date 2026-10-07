import ActionForm from "@/components/forms/action-form";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addCandidate,
  updateCandidateStage,
  addOnboardingTask,
  toggleOnboardingTask,
  hireCandidate,
} from "../actions";

const STAGES = ["Screened", "Shortlisted", "Interviewed", "Offered", "Hired", "Rejected"];

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ requisitionId: string }>;
}) {
  const { requisitionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user!.id)
    .maybeSingle();
  const canEdit = appUser?.role === "admin" || appUser?.role === "hr" || appUser?.role === "manager";

  const [{ data: requisition }, { data: candidates }] = await Promise.all([
    supabase.from("requisitions").select("*, employees(name)").eq("id", requisitionId).single(),
    supabase
      .from("candidates")
      .select("id, name, source, stage, employee_id, added_on, onboarding_tasks(id, task, done)")
      .eq("requisition_id", requisitionId)
      .order("added_on", { ascending: false }),
  ]);

  if (!requisition) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Requisition not found.</p>;
  }

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
          Headcount {requisition.headcount} · Hiring manager:{" "}
          {(requisition.employees as unknown as { name: string } | null)?.name ?? "—"} · Status{" "}
          {requisition.status}
        </p>
      </div>

      <div className="space-y-4">
        {(candidates ?? []).map((c) => (
          <div key={c.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{c.name}</span>
                {c.source && <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">via {c.source}</span>}
              </div>
              <span className="text-xs uppercase tracking-wide bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded">
                {c.stage}
              </span>
            </div>

            {canEdit && c.stage !== "Hired" && (
              <ActionForm action={updateCandidateStage} className="mt-3 flex gap-2 text-sm">
                <input type="hidden" name="candidate_id" value={c.id} />
                <input type="hidden" name="requisition_id" value={requisitionId} />
                <select name="stage" defaultValue={c.stage} className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1">
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1">
                  Update stage
                </button>
              </ActionForm>
            )}

            {canEdit && c.stage === "Offered" && (
              <ActionForm action={hireCandidate.bind(null, c.id, requisitionId)} className="mt-3" successMessage={null}>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                  Creates an employee record for {c.name} in {requisition.department} as{" "}
                  {requisition.role} — staff no, compensation, branch, and the rest are filled in
                  on the Employees page right after.
                </p>
                <button type="submit" className="text-sm bg-green-700 hover:bg-green-800 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
                  Hire → create employee record
                </button>
              </ActionForm>
            )}

            {(c.stage === "Offered" || c.stage === "Hired") && (
              <div className="mt-3 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 mb-2">Onboarding checklist</p>
                <ul className="space-y-1">
                  {(c.onboarding_tasks as unknown as { id: string; task: string; done: boolean }[]).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <ActionForm action={toggleOnboardingTask.bind(null, t.id, requisitionId, !t.done)} successMessage={null}>
                        <button type="submit" className={t.done ? "text-green-600" : "text-neutral-400 dark:text-neutral-500"}>
                          {t.done ? "☑" : "☐"}
                        </button>
                      </ActionForm>
                      <span className={t.done ? "line-through text-neutral-400 dark:text-neutral-500" : ""}>{t.task}</span>
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <ActionForm
                    action={addOnboardingTask.bind(null, c.id, requisitionId)}
                    className="mt-2 flex gap-2 text-sm"
                  >
                    <input name="task" placeholder="Add a task…" required className="flex-1 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1" />
                    <button type="submit" className="text-xs bg-neutral-200 dark:bg-neutral-700 rounded px-3 py-1">
                      Add
                    </button>
                  </ActionForm>
                )}
              </div>
            )}
          </div>
        ))}
        {(!candidates || candidates.length === 0) && (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">No candidates yet.</p>
        )}
      </div>

      {canEdit && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Add candidate</h2>
          <ActionForm action={addCandidate.bind(null, requisitionId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="name" placeholder="Candidate name" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <input name="source" placeholder="Source (referral, job board...)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
              Add candidate
            </button>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
