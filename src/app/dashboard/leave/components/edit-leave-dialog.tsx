"use client";

// Edit a leave request at any stage. Shows the same availability warnings as
// the request dialog (excluding the request being edited) and tells the
// employee up front whether the change will need approval again.
import { useState, useTransition } from "react";
import { checkLeaveConflicts, editLeaveRequest } from "../actions";
import { LeaveConflictPanel } from "./leave-conflict-panel";
import { leaveEditOutcome, type LeaveStatus } from "@/lib/leave/leave-edit-outcome";
import type { LeaveConflict } from "@/lib/leave/leave-types";

const LEAVE_TYPES = ["Annual", "Sick", "Compassionate", "Maternity", "Paternity", "Unpaid", "Study"];

export type EditableLeave = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
};

export default function EditLeaveDialog({ request, asApprover }: { request: EditableLeave; asApprover: boolean }) {
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState(request.leave_type);
  const [start, setStart] = useState(request.start_date);
  const [end, setEnd] = useState(request.end_date);
  const [conflicts, setConflicts] = useState<LeaveConflict[]>([]);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [checking, startChecking] = useTransition();
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runCheck(t: string, s: string, e: string) {
    if (!s || !e || e < s) {
      setConflicts([]);
      setWorkingDays(null);
      return;
    }
    startChecking(() => {
      checkLeaveConflicts(request.employee_id, t, s, e, request.id).then((res) => {
        setConflicts(res.conflicts);
        setWorkingDays(res.workingDays);
      });
    });
  }

  const outcome =
    workingDays === null
      ? null
      : leaveEditOutcome({
          editorIsApprover: asApprover,
          oldStatus: request.status,
          oldType: request.leave_type,
          oldStart: request.start_date,
          oldEnd: request.end_date,
          oldDays: request.days,
          newType: leaveType,
          newStart: start,
          newEnd: end,
          newDays: workingDays,
        });

  function onSubmit(formData: FormData) {
    setError(null);
    startSaving(async () => {
      const res = await editLeaveRequest(request.id, {}, formData);
      if (res.error) setError(res.error);
      else setOpen(false);
    });
  }

  const input = "mt-1 w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 hover:dark:bg-neutral-700"
      >
        Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-neutral-900/30" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Edit leave request</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Currently {request.status.toLowerCase()}.</p>
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
                  className={input}
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>{t} Leave</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">Start date</span>
                  <input name="start_date" type="date" required value={start} onChange={(e) => { setStart(e.target.value); runCheck(leaveType, e.target.value, end); }} className={input} />
                </label>
                <label className="block">
                  <span className="text-neutral-600 dark:text-neutral-300 text-xs">End date</span>
                  <input name="end_date" type="date" required value={end} onChange={(e) => { setEnd(e.target.value); runCheck(leaveType, start, e.target.value); }} className={input} />
                </label>
              </div>
              {workingDays !== null && <p className="text-xs text-neutral-500 dark:text-neutral-400">Working days: {workingDays}</p>}
              <label className="block">
                <span className="text-neutral-600 dark:text-neutral-300 text-xs">Reason (optional)</span>
                <input name="reason" defaultValue={request.reason ?? ""} className={input} />
              </label>

              {outcome && (
                <p className="text-xs rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-neutral-600 dark:text-neutral-300">
                  {asApprover
                    ? `Status stays ${request.status.toLowerCase()}; the employee will be told about the change.`
                    : outcome === "Approved"
                      ? "This only shortens your approved leave, so it stays approved."
                      : "This change will go to your manager/HR for approval again."}
                </p>
              )}
              {checking && <p className="text-xs text-neutral-400 dark:text-neutral-500">Checking availability…</p>}
              {!checking && <LeaveConflictPanel conflicts={conflicts} />}
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-500 dark:text-neutral-400 px-3 py-2">Close</button>
                <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 font-medium disabled:opacity-60">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
