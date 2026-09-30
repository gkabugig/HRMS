"use client";

import { useTransition } from "react";
import { decideApproval } from "./actions";

export default function ApprovalInboxRow({
  stepId,
  requestType,
  summary,
  employeeName,
  createdAt,
}: {
  stepId: string;
  requestType: string;
  summary: string;
  employeeName: string | null;
  createdAt: string;
}) {
  const [isPending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    startTransition(() => decideApproval(stepId, decision));
  }

  return (
    <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-brand-600 font-medium">{requestType.replace(/_/g, " ")}</p>
        <p className="text-sm text-neutral-900">{summary}</p>
        <p className="text-xs text-neutral-400">
          {employeeName ? `${employeeName} · ` : ""}
          {new Date(createdAt).toLocaleString("en-KE")}
        </p>
      </div>
      <div className="flex gap-2">
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
