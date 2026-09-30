"use client";

import { cancelLeaveRequest } from "../actions";

export default function CancelButton({ id }: { id: string }) {
  return (
    <button
      className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
      onClick={() => {
        if (confirm("Cancel this leave request?")) cancelLeaveRequest(id);
      }}
    >
      Cancel
    </button>
  );
}
