"use client";

import { useState, useTransition } from "react";
import { cancelLeaveRequest } from "../actions";

export default function CancelButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        disabled={pending}
        className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 hover:dark:bg-neutral-700 disabled:opacity-50"
        onClick={() => {
          if (!confirm("Cancel this leave request?")) return;
          setError(null);
          start(async () => {
            const res = await cancelLeaveRequest(id, {}, new FormData());
            if (res.error) setError(res.error);
          });
        }}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600 mt-1 max-w-[16rem]">
          {error}
        </p>
      )}
    </div>
  );
}
