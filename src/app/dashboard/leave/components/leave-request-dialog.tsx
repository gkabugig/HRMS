"use client";

// Fast leave request dialog (spec §6): shows balance/conflict warnings
// before submission by calling the same conflict engine the server uses,
// so nothing here can drift from what actually gets enforced.
import { useState, useTransition } from "react";
import { applyForLeave, checkLeaveConflicts } from "../actions";
import { LeaveConflictPanel } from "./leave-conflict-panel";
import type { LeaveConflict } from "@/lib/leave/leave-types";

const LEAVE_TYPES = ["Annual", "Sick", "Compassionate", "Maternity", "Paternity", "Unpaid", "Study"];

export function LeaveRequestDialog({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("Annual");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [conflicts, setConflicts] = useState<LeaveConflict[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [checking, startChecking] = useTransition();
  const [submitting, startSubmitting] = useTransition();

  function runCheck(nextType: string, nextStart: string, nextEnd: string) {
    if (!nextStart || !nextEnd || nextEnd < nextStart) {
      setConflicts([]);
      setWorkingDays(null);
      return;
    }
    startChecking(() => {
      checkLeaveConflicts(employeeId, nextType, nextStart, nextEnd).then((res) => {
        setConflicts(res.conflicts);
        setWorkingDays(res.workingDays);
      });
    });
  }

  function onSubmit(formData: FormData) {
    startSubmitting(async () => {
      await applyForLeave(formData);
      setOpen(false);
      setStart("");
      setEnd("");
      setConflicts([]);
      setWorkingDays(null);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 text-sm font-medium"
      >
        Request leave
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-neutral-900/30" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Request leave</h2>
            </div>
            <form action={onSubmit} className="px-5 py-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-neutral-600 dark:text-neutral-300 text-xs">Leave type</span>
                <select
                  name="leave_type"
                  value={leaveType}
                  onChange={(e) => {
                    setLeaveType(e.target.value);
                    runCheck(e.target.value, start, end);
                  }}
                  className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t} Leave
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Start date</span>
                  <input
                    name="start_date"
                    type="date"
                    required
                    value={start}
                    onChange={(e) => {
                      setStart(e.target.value);
                      runCheck(leaveType, e.target.value, end);
                    }}
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">End date</span>
                  <input
                    name="end_date"
                    type="date"
                    required
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      runCheck(leaveType, start, e.target.value);
                    }}
                    className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2"
                  />
                </label>
              </div>
              {workingDays !== null && <p className="text-xs text-neutral-500 dark:text-neutral-400">Working days: {workingDays}</p>}
              <label className="block">
                <span className="text-neutral-600 dark:text-neutral-300 text-xs">Reason (optional)</span>
                <input name="reason" className="mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2" />
              </label>

              {checking && <p className="text-xs text-neutral-400 dark:text-neutral-500">Checking availability…</p>}
              {!checking && (start || end) && <LeaveConflictPanel conflicts={conflicts} />}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 dark:text-neutral-400 px-3 py-2">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 font-medium disabled:opacity-60"
                >
                  {submitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
