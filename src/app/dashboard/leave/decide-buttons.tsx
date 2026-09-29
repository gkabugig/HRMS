"use client";

import { decideLeave } from "./actions";

export default function DecideButtons({ id }: { id: string }) {
  return (
    <div className="flex gap-2">
      <button
        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700"
        onClick={() => decideLeave(id, "Approved")}
      >
        Approve
      </button>
      <button
        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700"
        onClick={() => decideLeave(id, "Rejected")}
      >
        Reject
      </button>
    </div>
  );
}
