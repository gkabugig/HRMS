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
    return <p className="text-sm text-neutral-500">Requisition not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/recruitment" className="text-sm text-blue-600 hover:underline">
          ← All requisitions
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 mt-1">
          {requisition.role} — {requisition.department}
        </h1>
        <p className="text-sm text-neutral-500">
          Headcount {requisition.headcount} · Hiring manager:{" "}
          {(requisition.employees as unknown as { name: string } | null)?.name ?? "—"} · Status{" "}
          {requisition.status}
        </p>
      </div>

      <div className="space-y-4">
        {(candidates ?? []).map((c) => (
          <div key={c.id} className="bg-white border border-neutral-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{c.name}</span>
                {c.source && <span className="text-xs text-neutral-500 ml-2">via {c.source}</span>}
              </div>
              <span className="text-xs uppercase tracking-wide bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
                {c.stage}
              </span>
            </div>

            {canEdit && c.stage !== "Hired" && (
              <form action={updateCandidateStage} className="mt-3 flex gap-2 text-sm">
                <input type="hidden" name="candidate_id" value={c.id} />
                <input type="hidden" name="requisition_id" value={requisitionId} />
                <select name="stage" defaultValue={c.stage} className="border border-neutral-300 rounded px-2 py-1">
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-xs bg-neutral-900 text-white rounded px-3 py-1">
                  Update stage
                </button>
              </form>
            )}

            {canEdit && c.stage === "Offered" && (
              <details className="mt-3">
                <summary className="text-sm text-blue-600 cursor-pointer">Hire this candidate</summary>
                <form
                  action={hireCandidate.bind(null, c.id, requisitionId)}
                  className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm"
                >
                  <input name="staff_no" placeholder="Staff No" required className="border border-neutral-300 rounded px-2 py-1" />
                  <input name="department" placeholder="Department" defaultValue={requisition.department} required className="border border-neutral-300 rounded px-2 py-1" />
                  <input name="job_title" placeholder="Job title" defaultValue={requisition.role} required className="border border-neutral-300 rounded px-2 py-1" />
                  <select name="employment_type" className="border border-neutral-300 rounded px-2 py-1">
                    <option>Permanent</option>
                    <option>Contract</option>
                    <option>Casual</option>
                    <option>Intern</option>
                  </select>
                  <input name="date_of_hire" type="date" required className="border border-neutral-300 rounded px-2 py-1" />
                  <input name="basic" type="number" step="0.01" placeholder="Basic salary" className="border border-neutral-300 rounded px-2 py-1" />
                  <input name="house_allowance" type="number" step="0.01" placeholder="House allowance" className="border border-neutral-300 rounded px-2 py-1" />
                  <input name="transport_allowance" type="number" step="0.01" placeholder="Transport allowance" className="border border-neutral-300 rounded px-2 py-1" />
                  <button type="submit" className="col-span-2 sm:col-span-3 bg-green-700 text-white rounded py-1.5 font-medium">
                    Confirm hire → create employee record
                  </button>
                </form>
              </details>
            )}

            {(c.stage === "Offered" || c.stage === "Hired") && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-xs font-medium text-neutral-600 mb-2">Onboarding checklist</p>
                <ul className="space-y-1">
                  {(c.onboarding_tasks as unknown as { id: string; task: string; done: boolean }[]).map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <form action={toggleOnboardingTask.bind(null, t.id, requisitionId, !t.done)}>
                        <button type="submit" className={t.done ? "text-green-600" : "text-neutral-400"}>
                          {t.done ? "☑" : "☐"}
                        </button>
                      </form>
                      <span className={t.done ? "line-through text-neutral-400" : ""}>{t.task}</span>
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <form
                    action={addOnboardingTask.bind(null, c.id, requisitionId)}
                    className="mt-2 flex gap-2 text-sm"
                  >
                    <input name="task" placeholder="Add a task…" required className="flex-1 border border-neutral-300 rounded px-2 py-1" />
                    <button type="submit" className="text-xs bg-neutral-200 rounded px-3 py-1">
                      Add
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ))}
        {(!candidates || candidates.length === 0) && (
          <p className="text-sm text-neutral-400">No candidates yet.</p>
        )}
      </div>

      {canEdit && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Add candidate</h2>
          <form action={addCandidate.bind(null, requisitionId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input name="name" placeholder="Candidate name" required className="border border-neutral-300 rounded px-3 py-2" />
            <input name="source" placeholder="Source (referral, job board...)" className="border border-neutral-300 rounded px-3 py-2" />
            <button type="submit" className="bg-neutral-900 text-white rounded py-2 font-medium">
              Add candidate
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
