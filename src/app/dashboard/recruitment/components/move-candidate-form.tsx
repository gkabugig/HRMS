"use client";

import { useState } from "react";
import ActionForm from "@/components/forms/action-form";
import { updateCandidateStage } from "../actions";
import { STAGES, REJECTION_REASONS } from "@/lib/recruitment/stages";

const field = "border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-2 py-1 text-xs";

// Move a candidate to another stage. Choosing "Rejected" asks for a reason,
// which is kept on the record and in the history.
export default function MoveCandidateForm({
  candidateId,
  requisitionId,
  stage,
}: {
  candidateId: string;
  requisitionId: string;
  stage: string;
}) {
  const [next, setNext] = useState(stage);
  const [reason, setReason] = useState("");
  const options = STAGES.filter((s) => s !== "Hired" && s !== stage);
  return (
    <ActionForm action={updateCandidateStage} className="flex flex-wrap items-center gap-2" successMessage={null} resetOnSuccess={false}>
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="requisition_id" value={requisitionId} />
      <select name="stage" value={next} onChange={(e) => setNext(e.target.value)} className={field} aria-label="Move to stage">
        <option value={stage}>Move to…</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {next === "Rejected" && (
        <>
          <select name="rejection_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} required aria-label="Reason">
            <option value="">Reason…</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {reason === "Other" && <input name="rejection_reason_other" placeholder="Reason" required className={field} />}
        </>
      )}
      {next !== stage && (
        <button type="submit" className="text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1">
          Move
        </button>
      )}
    </ActionForm>
  );
}
