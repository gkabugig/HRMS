// Area 16 §7.3/§7.4 Establishment screen — the full positions register with
// lifecycle status, plus position-type reference management and a quick
// "activate" action for approved-but-not-yet-active positions.
import { createClient } from "@/lib/supabase/server";
import { createPositionType } from "@/lib/positions/admin-actions";
import { activatePosition } from "@/lib/positions/position-request-actions";
import Link from "next/link";

export default async function EstablishmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role, org_id").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Visible to HR and admin roles.</div>;
  }

  const [{ data: positions }, { data: positionTypes }] = await Promise.all([
    supabase
      .from("positions")
      .select("id, title, position_code, lifecycle_status, status, approved_headcount, is_active, position_types(name)")
      .eq("org_id", appUser.org_id)
      .order("title"),
    supabase.from("position_types").select("id, code, name, is_active").eq("org_id", appUser.org_id).order("code"),
  ]);

  const statusColor: Record<string, string> = {
    draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
    submitted: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    frozen: "bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-200",
    closed: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Establishment</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">All positions and their lifecycle status.</p>
        </div>
        <Link href="/dashboard/positions/requests" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-3 py-1.5 text-xs font-medium">
          New position request
        </Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Headcount</th>
              <th className="px-4 py-2 font-medium">Occupancy</th>
              <th className="px-4 py-2 font-medium">Lifecycle</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(positions ?? []).map((p) => {
              const type = p.position_types as unknown as { name: string } | null;
              return (
                <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/positions/${p.id}`} className="text-neutral-800 dark:text-neutral-100 hover:underline">{p.title}</Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500 dark:text-neutral-400">{p.position_code ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">{type?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">{p.approved_headcount}</td>
                  <td className="px-4 py-2 text-xs text-neutral-500 dark:text-neutral-400">{p.status}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[p.lifecycle_status] ?? "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"}`}>
                      {p.lifecycle_status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.lifecycle_status === "approved" && (
                      <form action={async () => { "use server"; await activatePosition(p.id); }}>
                        <button type="submit" className="text-xs text-brand-700 hover:underline">Activate</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {(positions ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-4 text-xs text-neutral-400 dark:text-neutral-500" colSpan={7}>No positions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Position types</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {(positionTypes ?? []).map((t) => (
            <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">{t.name} ({t.code})</span>
          ))}
          {(positionTypes ?? []).length === 0 && <p className="text-xs text-neutral-400 dark:text-neutral-500">No position types defined yet.</p>}
        </div>
        <form action={createPositionType} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <input name="code" placeholder="Code (e.g. TEACH)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="name" placeholder="Name (e.g. Teaching Staff)" required className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5" />
          <input name="description" placeholder="Description (optional)" className="border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 sm:col-span-2" />
          <button type="submit" className="sm:col-span-4 bg-neutral-900 hover:bg-neutral-800 text-white rounded px-3 py-1.5 font-medium w-fit">
            Add position type
          </button>
        </form>
      </div>
    </div>
  );
}
