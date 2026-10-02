"use client";

import { useTransition } from "react";
import { decideApproval, escalateApprovalStep } from "./actions";

export default function ApprovalInboxRow({
  stepId,
  requestType,
  summary,
  employeeName,
  createdAt,
  dueAt,
  isOverdue,
  canEscalate,
}: {
  stepId: string;
  requestType: string;
  summary: string;
  employeeName: string | null;
  createdAt: string;
  dueAt?: string | null;
  // Computed server-side (page.tsx already knows "now" at render time) —
  // keeps this component a pure function of its props instead of reading
  // the clock itself on every render.
  isOverdue?: boolean;
  canEscalate?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(() => decideApproval(stepId, decision));
  }

  function escalate() {
    startTransition(() => escalateApprovalStep(stepId, "Manually escalated — overdue"));
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">{requestType.replace(/_/g, " ")}</p>
          {isOverdue && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Overdue
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-900 dark:text-neutral-50">{summary}</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {employeeName ? `${employeeName} · ` : ""}
          {new Date(createdAt).toLocaleString("en-KE")}
          {dueAt ? ` · due ${new Date(dueAt).toLocaleString("en-KE")}` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        {isOverdue && canEscalate && (
          <button
            disabled={isPending}
            onClick={escalate}
            className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            Escalate
          </button>
        )}
        <button
          disabled={isPending}
          onClick={() => decide("approved")}
          className="text-xs font-medium bg-green-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          disabled={isPending}
          onClick={() => decide("rejected")}
          className="text-xs font-medium bg-red-50 text-red-600 rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
