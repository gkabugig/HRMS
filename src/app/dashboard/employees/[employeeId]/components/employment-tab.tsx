import type { Employee360 } from "@/lib/employees/get-employee-360";
import { addContact, deleteContact, addNote } from "../actions";

export function EmploymentTab({
  data,
  employeeId,
  canManageContacts,
  canAddNote,
  canSeeNotes,
}: {
  data: Employee360;
  employeeId: string;
  canManageContacts: boolean;
  canAddNote: boolean;
  canSeeNotes: boolean;
}) {
  const e = data.employee;
  const today = new Date().toISOString().slice(0, 10);
  const onProbation = e.probation_end_date && (e.probation_end_date as string) >= today;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Current Record</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Employment type" value={e.employment_type as string} />
          <Row label="Department" value={e.department as string} />
          <Row label="Job title" value={e.job_title as string} />
          <Row label="Manager" value={data.manager?.name ?? "—"} />
          <Row label="Status" value={e.status as string} />
          <Row label="Contract issued on" value={(e.contract_issued_on as string) ?? "Not on file"} />
          <Row
            label="Probation"
            value={
              e.probation_end_date
                ? onProbation
                  ? `Until ${e.probation_end_date}`
                  : `Ended ${e.probation_end_date}`
                : "—"
            }
          />
        </dl>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-neutral-900">Job History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium">Department</th>
              <th className="px-4 py-2 font-medium">Job title</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.jobHistory.map((h) => (
              <tr key={h.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">{h.effective_from}</td>
                <td className="px-4 py-2">{h.effective_to ?? "Present"}</td>
                <td className="px-4 py-2">{h.department}</td>
                <td className="px-4 py-2">{h.job_title}</td>
                <td className="px-4 py-2">{h.employment_type}</td>
                <td className="px-4 py-2 text-neutral-500">{h.reason ?? "—"}</td>
              </tr>
            ))}
            {data.jobHistory.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  No job history recorded yet — it starts building the next time this record changes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Emergency Contacts</h2>
        <ul className="space-y-2 text-sm">
          {data.contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-neutral-50 pb-2">
              <div>
                <span className="font-medium text-neutral-900">{c.name}</span>
                {c.is_primary && <span className="text-xs text-brand-600 ml-2">Primary</span>}
                <p className="text-xs text-neutral-500">
                  {[c.relationship, c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {canManageContacts && (
                <form action={deleteContact.bind(null, c.id, employeeId)}>
                  <button type="submit" className="text-xs text-red-600 hover:underline shrink-0">
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
          {data.contacts.length === 0 && <p className="text-sm text-neutral-400">No contacts on file.</p>}
        </ul>

        {canManageContacts && (
          <form action={addContact.bind(null, employeeId)} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input name="name" placeholder="Name" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="relationship" placeholder="Relationship" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="phone" placeholder="Phone" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <input name="email" placeholder="Email" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <label className="flex items-center gap-1.5 text-neutral-600">
              <input type="checkbox" name="is_primary" /> Primary contact
            </label>
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Add contact
            </button>
          </form>
        )}
      </div>

      {canSeeNotes && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">HR Notes</h2>
          <ul className="space-y-2 text-sm">
            {data.notes.map((n) => (
              <li key={n.id} className="border-b border-neutral-50 pb-2">
                <p className="text-neutral-800">{n.note}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {n.note_type} · {n.visibility} · {new Date(n.created_at).toLocaleDateString("en-KE")}
                </p>
              </li>
            ))}
            {data.notes.length === 0 && <p className="text-sm text-neutral-400">No notes yet.</p>}
          </ul>

          {canAddNote && (
            <form action={addNote.bind(null, employeeId)} className="mt-4 flex flex-col sm:flex-row gap-2 text-xs">
              <textarea
                name="note"
                placeholder="Add a note…"
                required
                rows={2}
                className="flex-1 border border-neutral-300 rounded-lg px-2 py-1.5"
              />
              <select name="visibility" className="border border-neutral-300 rounded-lg px-2 py-1.5">
                <option value="HR">HR only</option>
                <option value="Manager">Manager visible</option>
              </select>
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
                Add note
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-50 py-1.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-900 font-medium text-right">{value}</dd>
    </div>
  );
}
