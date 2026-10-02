import type { LeaveRequestRow } from "@/lib/leave/leave-types";
import DecideButtons from "../decide-buttons";
import CancelButton from "./cancel-button";

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
              <td className="px-4 py-2">{r.status}</td>
              <td className="px-4 py-2">
                {r.status === "Pending" && canDecide && <DecideButtons id={r.id} />}
                {r.status === "Pending" && !canDecide && r.employee_id === selfEmployeeId && <CancelButton id={r.id} />}
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
