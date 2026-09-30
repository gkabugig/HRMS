"use client";

import { updateAssignmentStatus } from "./actions";

const STATUSES = ["Open", "In Progress", "Completed"] as const;

export function StatusSelect({ assignmentId, status }: { assignmentId: string; status: string }) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => updateAssignmentStatus(assignmentId, e.target.value)}
      className="text-xs border border-neutral-300 rounded px-2 py-1"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
