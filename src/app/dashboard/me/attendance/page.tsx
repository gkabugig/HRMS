// Area 05 §6 "My Attendance" — today's status, monthly summary, history,
// and the employee-submitted correction request flow (migration 0064 +
// src/lib/attendance/request-correction-actions.ts). Never exposes another
// employee's attendance — every query below is explicitly bound to
// ctx.employeeId, and attendance_self_read RLS enforces the same boundary
// independently.
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyAttendanceHistory, getMyAttendanceMonthSummary, getMyAttendanceCorrectionRequests } from "@/lib/employee-portal/get-my-attendance";
import { submitAttendanceCorrectionRequest, cancelAttendanceCorrectionRequest } from "@/lib/attendance/request-correction-actions";
import EmptyState from "@/components/employee-portal/empty-state";

const STATUS_STYLE: Record<string, string> = {
  Submitted: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  "Under Review": "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Cancelled: "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500",
};

export default async function MyAttendancePage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);

  const [{ rows: history, total }, summary, corrections, { data: documents }] = await Promise.all([
    getMyAttendanceHistory(supabase, ctx.employeeId, 0, 20),
    getMyAttendanceMonthSummary(supabase, ctx.employeeId),
    getMyAttendanceCorrectionRequests(supabase, ctx.employeeId),
    supabase.from("employee_documents").select("id, file_name").eq("employee_id", ctx.employeeId).order("uploaded_at", { ascending: false }),
  ]);

  const today = history.find((h) => h.workDate === new Date().toISOString().slice(0, 10));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Attendance</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Today&apos;s status, your history, and correction requests.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Today</p>
          <p className="text-sm text-neutral-900 dark:text-neutral-50 mt-1">In: <span className="font-mono">{today?.clockIn ?? "—"}</span> · Out: <span className="font-mono">{today?.clockOut ?? "—"}</span></p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{summary.monthLabel}</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{summary.present}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">days recorded</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Late arrivals this month</p>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">{summary.late}</p>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Request a correction</h2>
        <form action={submitAttendanceCorrectionRequest} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <input type="date" name="work_date" required max={new Date().toISOString().slice(0, 10)} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
          <select name="field" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="clock_in">Clock in</option>
            <option value="clock_out">Clock out</option>
          </select>
          <input type="time" name="requested_value" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
          <select name="evidence_document_id" className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">No supporting document</option>
            {(documents ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.file_name}</option>
            ))}
          </select>
          <textarea name="reason" placeholder="Why does this need correcting?" required rows={2} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 sm:col-span-2" />
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium justify-self-start sm:col-span-2">
            Submit correction request
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Correction requests</h2>
        {corrections.length === 0 ? (
          <div className="p-4"><EmptyState message="No correction requests yet." /></div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">Requested</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{c.workDate}</td>
                  <td className="px-4 py-2">{c.field === "clock_in" ? "Clock in" : "Clock out"}</td>
                  <td className="px-4 py-2 font-mono">{c.requestedValue}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {["Submitted", "Under Review"].includes(c.status) && (
                      <form action={cancelAttendanceCorrectionRequest.bind(null, c.id)}>
                        <button className="text-xs text-red-600 hover:underline">Withdraw</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">History ({total} record{total === 1 ? "" : "s"})</h2>
        <table className="w-full text-sm mt-3">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock in</th>
              <th className="px-4 py-2 font-medium">Clock out</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="px-4 py-2">{h.workDate}</td>
                <td className="px-4 py-2 font-mono">{h.clockIn ?? "—"}</td>
                <td className="px-4 py-2 font-mono">{h.clockOut ?? "—"}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">No attendance recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
