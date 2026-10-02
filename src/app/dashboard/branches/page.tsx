import { createClient } from "@/lib/supabase/server";
import { createBranch, deleteBranch } from "./actions";

export default async function BranchesPage() {
  const supabase = await createClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, location, employees(count)")
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Branches</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Locations employees can be assigned to from the Employees page.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Employees</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(branches ?? []).map((b) => {
              const count = (b.employees as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <tr key={b.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{b.location ?? "—"}</td>
                  <td className="px-4 py-2">{count}</td>
                  <td className="px-4 py-2">
                    <form action={deleteBranch.bind(null, b.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(!branches || branches.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No branches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Add branch</h2>
        <form action={createBranch} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <input name="name" placeholder="Branch name" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <input name="location" placeholder="Location (optional)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
            Add branch
          </button>
        </form>
      </div>
    </div>
  );
}
