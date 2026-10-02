"use client";

import { cancelLeaveRequest } from "../actions";

export default function CancelButton({ id }: { id: string }) {
  return (
    <button
      className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 hover:dark:bg-neutral-700"
      onClick={() => {
        if (confirm("Cancel this leave request?")) cancelLeaveRequest(id);
      }}
    >
      Cancel
    </button>
  );
}
