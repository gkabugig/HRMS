// Area 17 §8 Compensation Dashboard — summary and entry points.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CompensationDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600">Visible to HR and admin roles.</div>;
  }

  const [{ count: grades }, { count: pendingChanges }, { count: outsideBand }, { data: activeCycles }] = await Promise.all([
    supabase.from("compensation_grades").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id),
    supabase.from("compensation_change_requests").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("status", "submitted"),
    supabase.from("compensation_change_requests").select("id", { count: "exact", head: true }).eq("org_id", appUser.org_id).eq("is_outside_band", true).neq("status", "rejected"),
    supabase.from("compensation_review_cycles").select("id, name, status").eq("org_id", appUser.org_id).in("status", ["open", "calibration"]),
  ]);

  const cards = [
    { label: "Compensation grades", value: grades ?? 0, href: "/dashboard/compensation/grades" },
    { label: "Pending change requests", value: pendingChanges ?? 0, href: "/dashboard/compensation/change-requests" },
    { label: "Outside-band exceptions", value: outsideBand ?? 0, href: "/dashboard/compensation/change-requests" },
    { label: "Active review cycles", value: (activeCycles ?? []).length, href: "/dashboard/compensation/reviews" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Compensation Management</h1>
          <p className="text-sm text-neutral-500 mt-1">Grades, bands, change requests, annual reviews, budgets, and payroll handoff.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/dashboard/compensation/grades" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Grades &amp; Bands</Link>
          <Link href="/dashboard/compensation/components" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Components</Link>
          <Link href="/dashboard/compensation/plans" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Plans</Link>
          <Link href="/dashboard/compensation/change-requests" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Change Requests</Link>
          <Link href="/dashboard/compensation/reviews" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Reviews</Link>
          <Link href="/dashboard/compensation/budgets" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Budgets</Link>
          <Link href="/dashboard/compensation/payroll-export" className="border border-neutral-200 rounded px-3 py-1.5 hover:bg-neutral-50">Payroll Export</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-neutral-300">
            <p className="text-2xl font-semibold text-neutral-900">{c.value}</p>
            <p className="text-xs text-neutral-500 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      {(activeCycles ?? []).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-2">Active review cycles</h2>
          <ul className="space-y-1">
            {(activeCycles ?? []).map((c) => (
              <li key={c.id} className="text-sm">
                <Link href={`/dashboard/compensation/reviews/${c.id}`} className="text-neutral-800 hover:underline">{c.name}</Link>
                <span className="text-xs text-neutral-400 ml-2">({c.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
