// Area 17 §8.6 — review cycle detail: eligibility, calibration, approval.
import { createClient } from "@/lib/supabase/server";
import { addAllEmployeesToReviewCycle, calibrateReviewItem, approveReviewItem, closeReviewCycle } from "@/lib/compensation/review-actions";

export default async function CompensationReviewCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ data: cycle }, { data: items }] = await Promise.all([
    supabase.from("compensation_review_cycles").select("*").eq("id", id).eq("org_id", appUser.org_id).maybeSingle(),
    supabase
      .from("compensation_review_items")
      .select("id, manager_recommendation_pct, manager_comment, hr_decision_pct, hr_comment, status, employees(name, basic)")
      .eq("review_cycle_id", id)
      .order("status"),
  ]);

  if (!cycle) return <div className="text-sm text-neutral-500">Review cycle not found.</div>;

  const statusColor: Record<string, string> = {
    pending: "bg-neutral-100 text-neutral-500",
    recommended: "bg-amber-100 text-amber-700",
    calibrated: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">{cycle.name}</h1>
          <p className="text-sm text-neutral-500 mt-1">{cycle.period_start} — {cycle.period_end}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600">{cycle.status}</span>
          {cycle.status === "draft" && (
            <form action={async () => { "use server"; await addAllEmployeesToReviewCycle(id); }}>
              <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium">Add all active employees</button>
            </form>
          )}
          {cycle.status !== "closed" && (
            <form action={async () => { "use server"; await closeReviewCycle(id); }}>
              <button type="submit" className="text-xs text-neutral-500 hover:underline">Close cycle</button>
            </form>
          )}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Current basic</th>
              <th className="px-4 py-2 font-medium">Manager rec.</th>
              <th className="px-4 py-2 font-medium">HR decision</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => {
              const employee = item.employees as unknown as { name: string; basic: number } | null;
              return (
                <tr key={item.id} className="border-t border-neutral-100 align-top">
                  <td className="px-4 py-2 text-neutral-800">{employee?.name}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">KES {Number(employee?.basic ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600">{item.manager_recommendation_pct !== null ? `${item.manager_recommendation_pct}%` : "—"} <span className="text-neutral-400">{item.manager_comment}</span></td>
                  <td className="px-4 py-2">
                    {item.status === "recommended" || item.status === "calibrated" ? (
                      <form action={calibrateReviewItem} className="flex gap-1 items-center">
                        <input type="hidden" name="item_id" value={item.id} />
                        <input name="hr_decision_pct" type="number" step="0.1" defaultValue={item.hr_decision_pct ?? item.manager_recommendation_pct ?? ""} className="w-16 border border-neutral-200 rounded px-1.5 py-1 text-xs" />
                        <button type="submit" className="text-xs text-brand-700 hover:underline">Set %</button>
                      </form>
                    ) : (
                      <span className="text-xs text-neutral-500">{item.hr_decision_pct !== null ? `${item.hr_decision_pct}%` : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[item.status] ?? "bg-neutral-100"}`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {item.status === "calibrated" && (
                      <form action={async () => { "use server"; await approveReviewItem(item.id); }}>
                        <button type="submit" className="text-xs text-green-700 hover:underline">Approve</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(items ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400" colSpan={6}>No employees in this cycle yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
