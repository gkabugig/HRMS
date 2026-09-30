"use client";

// The workflow bar (spec §3, §24) reflects state — it does not decide it.
// Advancing a stage submits the actual server action; this component just
// shows where the run currently sits and offers the one or two next valid
// transitions, per lib/payroll/state-machine.ts.
import { useActionState, useState } from "react";
import { PAYROLL_STATUSES, STATUS_LABELS, type PayrollStatus } from "@/lib/payroll/state-machine";
import { calculateRun, transitionRun, type PayrollActionState } from "../actions";

const initialActionState: PayrollActionState = {};

const STAGE_ACTION_LABEL: Partial<Record<PayrollStatus, string>> = {
  calculated: "Calculate",
  under_review: "Submit for Review",
  approved: "Approve",
  processed: "Process",
  paid: "Mark Paid",
  closed: "Lock & Close",
};

export default function PayrollWorkflow({
  runId,
  status,
  locked,
  next,
  canManage,
}: {
  runId: string;
  status: PayrollStatus;
  locked: boolean;
  next: PayrollStatus[];
  canManage: boolean;
}) {
  const [pendingComment, setPendingComment] = useState<PayrollStatus | null>(null);
  const [calcState, calcAction, calculating] = useActionState(calculateRun, initialActionState);
  const [transitionState, transitionAction, transitioning] = useActionState(transitionRun, initialActionState);
  const currentIndex = PAYROLL_STATUSES.indexOf(status);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <div className="flex items-center overflow-x-auto pb-1">
        {PAYROLL_STATUSES.map((s, i) => (
          <div key={s} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5 px-1">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  i < currentIndex ? "bg-brand-400" : i === currentIndex ? "bg-brand-600 ring-4 ring-brand-100" : "bg-neutral-200"
                }`}
              />
              <span className={`text-[10px] whitespace-nowrap ${i === currentIndex ? "text-neutral-900 font-semibold" : "text-neutral-400"}`}>
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < PAYROLL_STATUSES.length - 1 && (
              <div className={`h-px w-6 sm:w-10 ${i < currentIndex ? "bg-brand-300" : "bg-neutral-200"}`} />
            )}
          </div>
        ))}
      </div>

      {canManage && !locked && next.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center gap-2">
            {next.map((n) =>
              n === "calculated" ? (
                <form key={n} action={calcAction}>
                  <input type="hidden" name="run_id" value={runId} />
                  <button
                    type="submit"
                    disabled={calculating}
                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg transition-colors py-2 px-4 text-sm font-medium"
                  >
                    {calculating ? "Working..." : status === "draft" || status === "inputs_open" ? "Run / Continue" : "Recalculate"}
                  </button>
                </form>
              ) : pendingComment === n ? (
                <form key={n} action={transitionAction} className="flex items-center gap-2">
                  <input type="hidden" name="run_id" value={runId} />
                  <input type="hidden" name="to" value={n} />
                  <input
                    name="comment"
                    placeholder="Comment (optional)"
                    className="text-sm border border-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={transitioning}
                    className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg transition-colors py-1.5 px-3 text-sm font-medium"
                  >
                    {transitioning ? "Working..." : `Confirm ${STATUS_LABELS[n]}`}
                  </button>
                </form>
              ) : (
                <button
                  key={n}
                  onClick={() => setPendingComment(n)}
                  className="border border-[var(--border-subtle)] hover:border-brand-300 text-neutral-700 rounded-lg transition-colors py-2 px-4 text-sm font-medium"
                >
                  {STAGE_ACTION_LABEL[n] ?? `Move to ${STATUS_LABELS[n]}`}
                </button>
              )
            )}
          </div>
          {calcState.error && <p className="text-xs text-red-600 mt-2">{calcState.error}</p>}
          {transitionState.error && <p className="text-xs text-red-600 mt-2">{transitionState.error}</p>}
        </div>
      )}
      {locked && <p className="text-xs text-neutral-400 mt-4 pt-4 border-t border-[var(--border-subtle)]">This payroll period is locked and immutable.</p>}
    </div>
  );
}
