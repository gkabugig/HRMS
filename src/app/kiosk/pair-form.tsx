"use client";

import { useActionState, useEffect } from "react";
import { pairKiosk, type PairResult } from "@/lib/branch-ops/kiosk-actions";

export default function PairForm() {
  const [state, action, pending] = useActionState(pairKiosk, {} as PairResult);

  useEffect(() => {
    if (state.paired) window.location.reload();
  }, [state.paired]);

  return (
    <form action={action} className="w-full max-w-sm space-y-4 text-center">
      <h1 className="text-2xl font-semibold">Set up this clocking kiosk</h1>
      <p className="text-sm text-neutral-400">
        Enter the pairing code shown in Branch Operations → Settings. The code works once and expires after 15 minutes.
      </p>
      <input
        name="code"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="K7Q4-M9XP"
        className="w-full rounded-xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-center text-2xl tracking-[0.3em] uppercase"
      />
      <button disabled={pending} className="w-full rounded-xl bg-white text-neutral-950 font-semibold py-3 disabled:opacity-50">
        {pending ? "Pairing…" : "Pair this device"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
