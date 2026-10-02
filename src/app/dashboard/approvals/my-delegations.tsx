"use client";

import { useTransition, useRef } from "react";
import { createMyDelegation, endMyDelegation } from "./delegation-actions";

type Colleague = { id: string; name: string };
type Delegation = {
  id: string;
  delegate_user_id: string;
  delegator_user_id: string;
  starts_at: string;
  ends_at: string;
  resource: string | null;
  reason: string | null;
  // Computed server-side (the server component already knows "now" at
  // render time) — keeps this component a pure function of its props
  // instead of reading the clock itself on every render.
  isActive?: boolean;
};

export default function MyDelegations({
  colleagues,
  myDelegations,
  delegatedToMe,
  resourceOptions,
}: {
  colleagues: Colleague[];
  myDelegations: Delegation[];
  delegatedToMe: (Delegation & { delegatorName: string | null })[];
  resourceOptions: { value: string; label: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      await createMyDelegation(formData);
      formRef.current?.reset();
    });
  }

  function end(id: string) {
    startTransition(() => endMyDelegation(id));
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">My Delegations</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Hand off your pending approvals to a colleague for a set window — useful when you&apos;re on leave or travelling. They
          can decide anything assigned to you (or just one module, if you scope it) until the window ends.
        </p>
      </div>

      <form ref={formRef} action={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
          Delegate to
          <select name="delegate_id" required className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm">
            <option value="">Choose a colleague…</option>
            {colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
          Scope
          <select name="resource" className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm">
            <option value="">Everything</option>
            {resourceOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
          Starts
          <input type="date" name="starts_at" required className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
          Ends
          <input type="date" name="ends_at" required className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1 sm:col-span-2">
          Reason (optional)
          <input
            type="text"
            name="reason"
            placeholder="e.g. Annual leave"
            className="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-sm"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={isPending}
            className="text-xs font-medium bg-brand-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            Create delegation
          </button>
        </div>
      </form>

      {myDelegations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Active & upcoming</p>
          {myDelegations.map((d) => {
            const delegate = colleagues.find((c) => c.id === d.delegate_user_id);
            const isActive = d.isActive ?? false;
            return (
              <div key={d.id} className="flex items-center justify-between gap-3 text-sm border border-neutral-100 dark:border-neutral-800 rounded-lg px-3 py-2">
                <div>
                  <p className="text-neutral-900 dark:text-neutral-50">
                    To <span className="font-medium">{delegate?.name ?? "—"}</span>
                    {d.resource ? ` · ${d.resource.replace(/_/g, " ")}` : " · everything"}
                    {isActive && <span className="ml-2 text-[10px] uppercase text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">Active</span>}
                  </p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">
                    {new Date(d.starts_at).toLocaleDateString("en-KE")} – {new Date(d.ends_at).toLocaleDateString("en-KE")}
                    {d.reason ? ` · ${d.reason}` : ""}
                  </p>
                </div>
                <button
                  disabled={isPending}
                  onClick={() => end(d.id)}
                  className="text-xs font-medium bg-red-50 text-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  End now
                </button>
              </div>
            );
          })}
        </div>
      )}

      {delegatedToMe.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Delegated to me</p>
          {delegatedToMe.map((d) => (
            <div key={d.id} className="text-sm border border-neutral-100 dark:border-neutral-800 rounded-lg px-3 py-2">
              <p className="text-neutral-900 dark:text-neutral-50">
                From <span className="font-medium">{d.delegatorName ?? "—"}</span>
                {d.resource ? ` · ${d.resource.replace(/_/g, " ")}` : " · everything"}
              </p>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {new Date(d.starts_at).toLocaleDateString("en-KE")} – {new Date(d.ends_at).toLocaleDateString("en-KE")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
