import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  addGoal,
  setSelfRating,
  setManagerRating,
  updateSelfComments,
  updateManagerComments,
  finalizeAppraisal,
} from "../actions";

export default async function AppraisalDetailPage({
  params,
}: {
  params: Promise<{ appraisalId: string }>;
}) {
  const { appraisalId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const [{ data: appraisal }, { data: goals }] = await Promise.all([
    supabase
      .from("appraisals")
      .select("*, employees(name)")
      .eq("id", appraisalId)
      .single(),
    supabase
      .from("appraisal_goals")
      .select("id, goal_text, weight, self_rating, manager_rating")
      .eq("appraisal_id", appraisalId)
      .order("goal_text"),
  ]);

  if (!appraisal) {
    return <p className="text-sm text-neutral-500">Appraisal not found.</p>;
  }

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";
  const isManagerLike = isHrLike || appUser?.role === "manager";
  const isOwnAppraisal = appUser?.employee_id === appraisal.employee_id;
  const canManage = isHrLike || appUser?.role === "manager";
  const isCompleted = appraisal.status === "Completed";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/performance" className="text-sm text-blue-600 hover:underline">
          ← All appraisals
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900 mt-1">
          {(appraisal.employees as unknown as { name: string } | null)?.name ?? "—"} — {appraisal.cycle}
        </h1>
        <p className="text-sm text-neutral-500">
          Status {appraisal.status}
          {appraisal.final_score != null && <> · Final score {appraisal.final_score} / 5</>}
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Goal</th>
              <th className="px-4 py-2 font-medium">Weight</th>
              <th className="px-4 py-2 font-medium">Self rating</th>
              <th className="px-4 py-2 font-medium">Manager rating</th>
            </tr>
          </thead>
          <tbody>
            {(goals ?? []).map((g) => (
              <tr key={g.id} className="border-t border-neutral-100 align-top">
                <td className="px-4 py-2">{g.goal_text}</td>
                <td className="px-4 py-2">{g.weight}%</td>
                <td className="px-4 py-2">
                  {isOwnAppraisal && !isCompleted ? (
                    <form
                      action={setSelfRating.bind(null, g.id, appraisalId)}
                      className="flex items-center gap-1"
                    >
                      <select
                        name="self_rating"
                        defaultValue={g.self_rating ?? ""}
                        className="border border-neutral-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs bg-neutral-200 rounded px-2 py-1">
                        Save
                      </button>
                    </form>
                  ) : (
                    g.self_rating ?? "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {canManage && !isCompleted ? (
                    <form
                      action={setManagerRating.bind(null, g.id, appraisalId)}
                      className="flex items-center gap-1"
                    >
                      <select
                        name="manager_rating"
                        defaultValue={g.manager_rating ?? ""}
                        className="border border-neutral-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs bg-neutral-200 rounded px-2 py-1">
                        Save
                      </button>
                    </form>
                  ) : (
                    g.manager_rating ?? "—"
                  )}
                </td>
              </tr>
            ))}
            {(!goals || goals.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  No goals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isManagerLike && !isCompleted && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Add goal</h2>
          <form action={addGoal.bind(null, appraisalId)} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input
              name="goal_text"
              placeholder="Goal description"
              required
              className="sm:col-span-2 border border-neutral-300 rounded px-3 py-2"
            />
            <input
              name="weight"
              type="number"
              min={0}
              max={100}
              placeholder="Weight %"
              required
              className="border border-neutral-300 rounded px-3 py-2"
            />
            <button type="submit" className="sm:col-span-3 bg-neutral-900 text-white rounded py-2 font-medium">
              Add goal
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Employee comments</h2>
          {isOwnAppraisal && !isCompleted ? (
            <form action={updateSelfComments.bind(null, appraisalId)} className="space-y-2">
              <textarea
                name="self_comments"
                defaultValue={appraisal.self_comments ?? ""}
                rows={4}
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
              />
              <button type="submit" className="text-xs bg-neutral-200 rounded px-3 py-1">
                Save
              </button>
            </form>
          ) : (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap">
              {appraisal.self_comments || "—"}
            </p>
          )}
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Manager comments</h2>
          {canManage && !isCompleted ? (
            <form action={updateManagerComments.bind(null, appraisalId)} className="space-y-2">
              <textarea
                name="manager_comments"
                defaultValue={appraisal.manager_comments ?? ""}
                rows={4}
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
              />
              <button type="submit" className="text-xs bg-neutral-200 rounded px-3 py-1">
                Save
              </button>
            </form>
          ) : (
            <p className="text-sm text-neutral-600 whitespace-pre-wrap">
              {appraisal.manager_comments || "—"}
            </p>
          )}
        </div>
      </div>

      {canManage && !isCompleted && (
        <form action={finalizeAppraisal.bind(null, appraisalId)}>
          <button type="submit" className="bg-green-700 text-white rounded px-4 py-2 text-sm font-medium">
            Finalize appraisal
          </button>
        </form>
      )}
    </div>
  );
}
