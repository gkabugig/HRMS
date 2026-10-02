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
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
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
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Compensation Management</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Grades, bands, change requests, annual reviews, budgets, and payroll handoff.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Link href="/dashboard/compensation/grades" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Grades &amp; Bands</Link>
          <Link href="/dashboard/compensation/components" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Components</Link>
          <Link href="/dashboard/compensation/plans" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Plans</Link>
          <Link href="/dashboard/compensation/change-requests" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Change Requests</Link>
          <Link href="/dashboard/compensation/reviews" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Reviews</Link>
          <Link href="/dashboard/compensation/budgets" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Budgets</Link>
          <Link href="/dashboard/compensation/payroll-export" className="border border-neutral-200 dark:border-neutral-700 rounded px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Payroll Export</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4 hover:border-neutral-300 hover:dark:border-neutral-600">
            <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{c.value}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      {(activeCycles ?? []).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Active review cycles</h2>
          <ul className="space-y-1">
            {(activeCycles ?? []).map((c) => (
              <li key={c.id} className="text-sm">
                <Link href={`/dashboard/compensation/reviews/${c.id}`} className="text-neutral-800 dark:text-neutral-100 hover:underline">{c.name}</Link>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 ml-2">({c.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
