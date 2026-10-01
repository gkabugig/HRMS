// Area 17 §8.6 Annual review flow — cycle list + create.
import { createClient } from "@/lib/supabase/server";
import { createReviewCycle } from "@/lib/compensation/review-actions";
import Link from "next/link";

export default async function CompensationReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const { data: cycles } = await supabase.from("compensation_review_cycles").select("id, name, period_start, period_end, status").eq("org_id", appUser.org_id).order("created_at", { ascending: false });

  const statusColor: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-500",
    open: "bg-amber-100 text-amber-700",
    calibration: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    closed: "bg-slate-200 text-slate-600",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Compensation Review Cycles</h1>
        <p className="text-sm text-neutral-500 mt-1">Cycle → eligible employees → manager recommendations → HR calibration → approval → effective-dated records.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <form action={createReviewCycle} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input name="name" placeholder="Cycle name (e.g. 2027 Annual Review)" required className="border border-neutral-200 rounded px-2 py-1.5 sm:col-span-2" />
          <input name="period_start" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <input name="period_end" type="date" required className="border border-neutral-200 rounded px-2 py-1.5" />
          <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 font-medium w-fit">Create cycle</button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {(cycles ?? []).map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/compensation/reviews/${c.id}`} className="text-neutral-800 hover:underline">{c.name}</Link>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">{c.period_start} — {c.period_end}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[c.status] ?? "bg-neutral-100"}`}>{c.status}</span>
                </td>
              </tr>
            ))}
            {(cycles ?? []).length === 0 && (
              <tr><td className="px-4 py-4 text-xs text-neutral-400">No review cycles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
