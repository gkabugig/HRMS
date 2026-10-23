"use client";

import { useActionState } from "react";
import { BTN, BTN_GHOST, INPUT, LABEL } from "@/components/ui/page-kit";
import { createKiosk, repairKiosk, type PairingResult } from "@/lib/branch-ops/admin-actions";

function CodeBox({ state }: { state: PairingResult }) {
  if (state.error)
    return (
      <p role="alert" className="text-xs text-red-600">
        {state.error}
      </p>
    );
  if (!state.code) return null;
  const until = state.expiresAt ? new Date(state.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : "";
  return (
    <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950 p-3 text-sm">
      <p>
        Pairing code for <strong>{state.kioskName}</strong>:
      </p>
      <p className="text-2xl font-semibold tracking-[0.25em] my-1">{state.code}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">
        On the branch tablet, open <strong>{typeof window !== "undefined" ? `${window.location.origin}/kiosk` : "/kiosk"}</strong> and type this code. It works once, until {until}. It is not shown again.
      </p>
    </div>
  );
}

export function CreateKioskForm({ branches }: { branches: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createKiosk, {} as PairingResult);
  return (
    <div className="space-y-3">
      <form action={action} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label>
          <span className={LABEL}>Branch</span>
          <select name="branch_id" required className={INPUT}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={LABEL}>Device name (optional)</span>
          <input name="name" placeholder="e.g. Counter tablet" className={INPUT} />
        </label>
        <button disabled={pending} className={BTN}>
          {pending ? "Creating…" : "Add kiosk and get pairing code"}
        </button>
      </form>
      <CodeBox state={state} />
    </div>
  );
}

export function RepairButton({ kioskId }: { kioskId: string }) {
  const [state, action, pending] = useActionState(repairKiosk.bind(null, kioskId), {} as PairingResult);
  return (
    <div className="space-y-2">
      <form action={action}>
        <button disabled={pending} className={BTN_GHOST}>
          {pending ? "…" : "New pairing code"}
        </button>
      </form>
      <CodeBox state={state} />
    </div>
  );
}
