import type { LeaveRequestRow } from "@/lib/leave/leave-types";
import DecideButtons from "../decide-buttons";
import CancelButton from "./cancel-button";
import EditLeaveDialog from "./edit-leave-dialog";

export function LeaveRequestList({
  requests,
  canDecide,
  selfEmployeeId,
}: {
  requests: LeaveRequestRow[];
  canDecide: boolean;
  selfEmployeeId: string | null;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Employee</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Dates</th>
            <th className="px-4 py-2 font-medium">Days</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="px-4 py-2">{r.employees?.name ?? "—"}</td>
              <td className="px-4 py-2">{r.leave_type}</td>
              <td className="px-4 py-2">
                {r.start_date} → {r.end_date}
              </td>
              <td className="px-4 py-2">{r.days}</td>
              <td className="px-4 py-2">
                {r.status}
                {(r.edit_count ?? 0) > 0 && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">Edited</span>}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-start gap-2">
                  {r.status === "Pending" && canDecide && <DecideButtons id={r.id} />}
                  {(canDecide || r.employee_id === selfEmployeeId) && (
                    <EditLeaveDialog
                      request={{ id: r.id, employee_id: r.employee_id, leave_type: r.leave_type, start_date: r.start_date, end_date: r.end_date, days: r.days, reason: r.reason, status: r.status }}
                      asApprover={canDecide && r.employee_id !== selfEmployeeId}
                    />
                  )}
                  {r.status === "Pending" && !canDecide && r.employee_id === selfEmployeeId && <CancelButton id={r.id} />}
                </div>
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                No leave requests.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
