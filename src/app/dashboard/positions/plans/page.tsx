// Area 16 §7.5 — workforce plans list + create form.
import { createClient } from "@/lib/supabase/server";
import { createWorkforcePlan } from "@/lib/positions/workforce-plan-actions";
import Link from "next/link";

export default async function WorkforcePlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const { data: plans } = await supabase
    .from("workforce_plans")
    .select("id, name, status, planning_period_start, planning_period_end, created_at")
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false });

  const statusColor: Record<string, string> = {
    draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
    submitted: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    closed: "bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Workforce Plans</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Planned headcount and cost by organisation unit and position type for a period.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">New plan</h2>
        <form action={createWorkforcePlan} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input name="name" placeholder="Plan name" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 sm:col-span-2" />
          <input name="planning_period_start" type="date" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="planning_period_end" type="date" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">Create plan</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(plans ?? []).map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/positions/plans/${p.id}`} className="text-neutral-800 dark:text-neutral-100 hover:underline">{p.name}</Link>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">{p.planning_period_start} — {p.planning_period_end}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[p.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{p.status}</span>
                </td>
              </tr>
            ))}
            {(plans ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500">No plans yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
