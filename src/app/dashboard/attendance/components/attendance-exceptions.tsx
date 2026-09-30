"use client";

import { useState } from "react";
import type { AttendanceException } from "@/lib/attendance/attendance-types";
import { submitAttendanceCorrection } from "../actions";

const TYPE_LABEL: Record<AttendanceException["type"], string> = {
  late_arrival: "Late arrival",
  missing_clock_out: "Missing clock-out",
  overtime: "Overtime",
  absent_without_leave: "Absent without leave",
  unscheduled_attendance: "Unscheduled attendance",
  schedule_mismatch: "No rest day (Employment Act s.27)",
};

const TYPE_DOT: Record<AttendanceException["type"], string> = {
  missing_clock_out: "bg-red-500",
  late_arrival: "bg-amber-500",
  overtime: "bg-amber-500",
  absent_without_leave: "bg-red-500",
  unscheduled_attendance: "bg-amber-500",
  schedule_mismatch: "bg-red-500",
};

export function AttendanceExceptions({ exceptions, canCorrect }: { exceptions: AttendanceException[]; canCorrect: boolean }) {
  const [correcting, setCorrecting] = useState<string | null>(null);

  if (exceptions.length === 0) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-2">Exceptions</h2>
        <p className="text-sm text-neutral-400">No open exceptions.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Exceptions ({exceptions.length})</h2>
      <ul className="space-y-2">
        {exceptions.map((e) => (
          <li key={e.id} className="border-b border-neutral-50 last:border-0 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm text-neutral-900">
                    <span className="font-medium">{e.employeeName}</span> — {TYPE_LABEL[e.type]}
                  </p>
                  <p className="text-xs text-neutral-500">{e.detail}</p>
                </div>
              </div>
              {canCorrect && (e.type === "missing_clock_out" || e.type === "late_arrival") && (
                <button
                  onClick={() => setCorrecting(correcting === e.id ? null : e.id)}
                  className="text-xs text-brand-600 hover:underline shrink-0"
                >
                  Correct
                </button>
              )}
            </div>
            {correcting === e.id && (
              <CorrectionForm
                employeeId={e.employeeId}
                workDate={e.workDate}
                field={e.type === "missing_clock_out" ? "clock_out" : "clock_in"}
                onDone={() => setCorrecting(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CorrectionForm({
  employeeId,
  workDate,
  field,
  onDone,
}: {
  employeeId: string;
  workDate: string;
  field: "clock_in" | "clock_out";
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        await submitAttendanceCorrection(formData);
        onDone();
      }}
      className="mt-2 flex flex-wrap items-end gap-2 text-xs bg-neutral-50 rounded-lg p-2.5"
    >
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="work_date" value={workDate} />
      <input type="hidden" name="field" value={field} />
      <label className="flex flex-col gap-0.5">
        <span className="text-neutral-500">Corrected {field === "clock_out" ? "clock-out" : "clock-in"}</span>
        <input name="corrected_value" type="time" required className="border border-neutral-300 rounded px-2 py-1" />
      </label>
      <label className="flex-1 min-w-[160px] flex flex-col gap-0.5">
        <span className="text-neutral-500">Reason (required)</span>
        <input name="reason" required className="border border-neutral-300 rounded px-2 py-1 w-full" />
      </label>
      <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded px-2.5 py-1 font-medium">
        Save
      </button>
    </form>
  );
}
