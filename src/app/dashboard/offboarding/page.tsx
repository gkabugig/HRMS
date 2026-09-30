import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { initiateOffboarding } from "./actions";

const EXIT_TYPES = ["Resignation", "Termination", "Redundancy", "End of Contract", "Retirement"];

export default async function OffboardingPage() {
  const supabase = await createClient();

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase
      .from("offboarding_records")
      .select("id, exit_type, notice_date, last_working_day, status, employees(name)")
      .order("initiated_on", { ascending: false }),
    supabase.from("employees").select("id, name").eq("status", "Active").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Offboarding</h1>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Exit type</th>
              <th className="px-4 py-2 font-medium">Notice date</th>
              <th className="px-4 py-2 font-medium">Last working day</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  {(r.employees as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">{r.exit_type}</td>
                <td className="px-4 py-2">{r.notice_date}</td>
                <td className="px-4 py-2">{r.last_working_day}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      r.status === "Completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/dashboard/offboarding/${r.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {(!records || records.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No offboarding records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Initiate an exit</h2>
        <form action={initiateOffboarding} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <select name="employee_id" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
            <option value="">Select employee</option>
            {(employees ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select name="exit_type" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2">
            <option value="">Exit type</option>
            {EXIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="notice_date"
            type="date"
            required
            className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            placeholder="Notice date"
          />
          <input
            name="last_working_day"
            type="date"
            required
            className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
            placeholder="Last working day"
          />
          <label className="flex items-center gap-2 text-neutral-600">
            <input type="checkbox" name="paid_in_lieu_of_notice" /> Paid in lieu of notice
          </label>
          <div className="sm:col-span-4 border-t border-neutral-100 pt-3 mt-1">
            <p className="text-xs text-neutral-500 mb-2">
              Redundancy only (s.40) — leave blank for other exit types:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs text-neutral-500 flex flex-col gap-1">
                Labour office notified on
                <input name="labour_office_notified_on" type="date" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
              </label>
              <label className="text-xs text-neutral-500 flex flex-col gap-1">
                Union notified on
                <input name="union_notified_on" type="date" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
              </label>
              <input
                name="selection_criteria"
                placeholder="Selection criteria used"
                className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
              />
            </div>
          </div>
          <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
            Start offboarding
          </button>
        </form>
      </div>
    </div>
  );
}
