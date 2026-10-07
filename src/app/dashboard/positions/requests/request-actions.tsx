"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ActionForm from "@/components/forms/action-form";
import { editPositionRequest, deletePositionRequest } from "@/lib/positions/position-request-actions";

type Option = { id: string; name: string };
const input = "border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900";

// Edit / delete controls for the person who submitted a position request,
// shown only while it is still waiting for its first decision.
export default function PositionRequestActions({
  id,
  requestType,
  payload,
  justification,
  units,
  types,
}: {
  id: string;
  requestType: string;
  payload: Record<string, unknown>;
  justification: string;
  units: Option[];
  types: Option[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const str = (k: string) => (payload[k] == null ? "" : String(payload[k]));
  const detailed = requestType === "create" || requestType === "change";

  function remove() {
    if (!window.confirm("Delete this request? It will be removed from Approvals and cannot be recovered.")) return;
    setError(null);
    start(async () => {
      const res = await deletePositionRequest(id);
      if (res.error) setError(res.error);
      else {
        router.push("/dashboard/positions/requests");
        router.refresh();
      }
    });
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-brand-600 hover:underline font-medium">
          {editing ? "Close" : "Edit"}
        </button>
        <button type="button" onClick={remove} disabled={pending} className="text-red-600 hover:underline font-medium disabled:opacity-50">
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && <p role="alert" className="text-red-600 mt-1">{error}</p>}
      {editing && (
        <ActionForm
          action={editPositionRequest.bind(null, id)}
          resetOnSuccess={false}
          successMessage="Request updated."
          className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-[min(480px,80vw)] text-left"
        >
          {detailed && (
            <>
              <input name="title" defaultValue={str("title")} placeholder="Title" className={input} />
              <input name="position_code" defaultValue={str("position_code")} placeholder="Position code (optional)" className={input} />
              <input name="approved_headcount" type="number" min={1} defaultValue={str("approved_headcount")} placeholder="Approved headcount" className={input} />
              <select name="organisation_unit_id" defaultValue={str("organisation_unit_id")} className={input}>
                <option value="">Organisation unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <select name="position_type_id" defaultValue={str("position_type_id")} className={input}>
                <option value="">Position type…</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </>
          )}
          <textarea name="justification" defaultValue={justification} required rows={2} placeholder="Justification (required)" className={`${input} sm:col-span-2`} />
          <button className="bg-brand-600 text-white rounded px-3 py-1.5 font-medium w-fit">Save changes</button>
        </ActionForm>
      )}
    </div>
  );
}
