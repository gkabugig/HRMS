"use client";

import { useState, useTransition } from "react";
import { decideLeave } from "./actions";

export default function DecideButtons({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function decide(decision: "Approved" | "Rejected") {
    setError(null);
    start(async () => {
      const res = await decideLeave(id, decision);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div>
      <div className="flex gap-2">
        <button disabled={pending} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 disabled:opacity-50" onClick={() => decide("Approved")}>
          Approve
        </button>
        <button disabled={pending} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 disabled:opacity-50" onClick={() => decide("Rejected")}>
          Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-1 max-w-[16rem]">
          {error}
        </p>
      )}
    </div>
  );
}
