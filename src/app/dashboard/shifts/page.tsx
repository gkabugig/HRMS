import { createClient } from "@/lib/supabase/server";
import { createShiftPattern, deleteShiftPattern, assignShift, unassignShift } from "./actions";

export default async function ShiftsPage() {
  const supabase = await createClient();

  const [{ data: shiftPatterns }, { data: employees }, { data: assignments }] = await Promise.all([
    supabase.from("shift_patterns").select("id, name, start_time, end_time, grace_minutes, employee_shifts(count)").order("name"),
    supabase.from("employees").select("id, name").eq("status", "Active").order("name"),
    supabase.from("employee_shifts").select("employee_id, shift_pattern_id, employees(name), shift_patterns(name)"),
  ]);

  const shiftByEmployee = new Map(
    (assignments ?? []).map((a) => [
      a.employee_id,
      (a.shift_patterns as unknown as { name: string } | null)?.name ?? "—",
    ])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Working Schedule</h1>
        <p className="text-sm text-neutral-500">
          Define shift patterns and assign employees to them — Attendance uses each employee&apos;s
          assigned shift (start time + grace period) to flag lateness, instead of one fixed 8am for
          everyone.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Shift</th>
              <th className="px-4 py-2 font-medium">Start</th>
              <th className="px-4 py-2 font-medium">End</th>
              <th className="px-4 py-2 font-medium">Grace</th>
              <th className="px-4 py-2 font-medium">Assigned</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(shiftPatterns ?? []).map((s) => {
              const count = (s.employee_shifts as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
              return (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 font-mono">{s.start_time}</td>
                  <td className="px-4 py-2 font-mono">{s.end_time}</td>
                  <td className="px-4 py-2">{s.grace_minutes} min</td>
                  <td className="px-4 py-2">{count}</td>
                  <td className="px-4 py-2">
                    <form action={deleteShiftPattern.bind(null, s.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {(!shiftPatterns || shiftPatterns.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No shift patterns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Add shift pattern</h2>
        <form action={createShiftPattern} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <input name="name" placeholder="Shift name (e.g. Day Shift)" required className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <input name="start_time" type="time" required defaultValue="08:00" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <input name="end_time" type="time" required defaultValue="17:00" className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <input name="grace_minutes" type="number" defaultValue={15} className="border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2" />
          <button type="submit" className="sm:col-span-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 font-medium">
            Add shift pattern
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Assign employees</h2>
        <div className="space-y-2">
          {(employees ?? []).map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate">{e.name}</span>
              <span className="text-xs text-neutral-500 w-32">{shiftByEmployee.get(e.id) ?? "Unassigned"}</span>
              <form action={assignShift} className="flex items-center gap-2 flex-1">
                <input type="hidden" name="employee_id" value={e.id} />
                <select name="shift_pattern_id" className="flex-1 border border-neutral-300 rounded-lg px-2 py-1 text-xs" defaultValue="">
                  <option value="" disabled>
                    Choose shift…
                  </option>
                  {(shiftPatterns ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-xs bg-neutral-200 rounded px-3 py-1">
                  Assign
                </button>
              </form>
              {shiftByEmployee.has(e.id) && (
                <form action={unassignShift.bind(null, e.id)}>
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Clear
                  </button>
                </form>
              )}
            </div>
          ))}
          {(!employees || employees.length === 0) && (
            <p className="text-sm text-neutral-400">No active employees yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
