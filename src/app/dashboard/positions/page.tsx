// Area 16 §7 Planning Dashboard — headcount/vacancy/plan/request summary and
// entry points into the rest of the module.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function PositionsDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ count: totalPositions }, { count: activePositions }, { count: vacantPositions }, { count: openVacancies }, { count: pendingRequests }, { data: plans }] =
    await Promise.all([
      supabase.from("positions").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("is_active", true),
      supabase.from("positions").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("lifecycle_status", "active"),
      supabase.from("positions").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("status", "vacant"),
      supabase.from("vacancies").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("status", "open"),
      supabase.from("position_requests").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("status", "submitted"),
      supabase.from("workforce_plans").select("id, name, status, planning_period_start, planning_period_end").eq("org_id", appUser.org_id).order("created_at", { ascending: false }).limit(5),
    ]);

  const cards = [
    { label: "Active positions", value: activePositions ?? 0, href: "/dashboard/positions/establishment" },
    { label: "Total positions", value: totalPositions ?? 0, href: "/dashboard/positions/establishment" },
    { label: "Vacant positions", value: vacantPositions ?? 0, href: "/dashboard/positions/vacancies" },
    { label: "Open vacancies", value: openVacancies ?? 0, href: "/dashboard/positions/vacancies" },
    { label: "Pending requests", value: pendingRequests ?? 0, href: "/dashboard/positions/requests" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Position &amp; Workforce Planning</h1>
          <p className="text-sm text-neutral-500 mt-1">Establishment, positions lifecycle, vacancies, workforce plans and what-if scenarios.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/dashboard/positions/establishment" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Establishment</Link>
          <Link href="/dashboard/positions/requests" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Requests</Link>
          <Link href="/dashboard/positions/vacancies" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Vacancies</Link>
          <Link href="/dashboard/positions/plans" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Plans</Link>
          <Link href="/dashboard/positions/scenarios" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Scenarios</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-neutral-300">
            <p className="text-2xl font-semibold text-neutral-900">{c.value}</p>
            <p className="text-xs text-neutral-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">Recent workforce plans</h2>
        <table className="w-full text-sm mt-2">
          <tbody>
            {(plans ?? []).map((p) => (
              <tr key={p.name} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-800">
                  <Link href="/dashboard/positions/plans" className="hover:underline">{p.name}</Link>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">{p.planning_period_start} — {p.planning_period_end}</td>
                <td className="px-4 py-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-600">{p.status}</span>
                </td>
              </tr>
            ))}
            {(plans ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-4 text-xs text-neutral-400">No workforce plans yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
