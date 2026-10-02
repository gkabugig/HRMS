import type { Employee360 } from "@/lib/employees/get-employee-360";
import { addContact, deleteContact } from "../actions";
import { submitProfileChangeRequest } from "@/lib/self-service/profile-change-actions";
import { ALLOWED_FIELDS } from "@/lib/self-service/profile-change-fields";

type PendingChange = { id: string; field: string; new_value: string; status: string; created_at: string };

export function BioTab({
  data,
  employeeId,
  canManageContacts,
  isOwnProfile = false,
  pendingChanges = [],
}: {
  data: Employee360;
  employeeId: string;
  canManageContacts: boolean;
  isOwnProfile?: boolean;
  pendingChanges?: PendingChange[];
}) {
  const e = data.employee;
  // The sensitive fields below are redacted to null server-side
  // (getEmployee360) for anyone other than admin/hr/the employee themselves.
  // Distinguish that from "genuinely blank" so a manager sees "Restricted"
  // rather than the misleading "Not on file".
  const restricted = "Restricted";
  const sensitive = (value: string | null | undefined) => (data.canViewSensitivePII ? value || "Not on file" : restricted);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Personal Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row
            label="Date of birth"
            value={
              !data.canViewSensitivePII
                ? restricted
                : e.date_of_birth
                  ? new Date(e.date_of_birth as string).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
                  : "Not on file"
            }
          />
          <Row label="Gender" value={(e.gender as string) || "Not on file"} />
          <Row label="Marital status" value={sensitive(e.marital_status as string | null)} />
          <Row label="Nationality" value={(e.nationality as string) || "Not on file"} />
          <Row label="National ID" value={sensitive(e.national_id as string | null)} />
          <Row label="Passport no." value={sensitive(e.passport_no as string | null)} />
        </dl>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Contact Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Phone number" value={sensitive(e.phone_number as string | null)} />
          <Row label="Personal email" value={sensitive(e.personal_email as string | null)} />
          <Row label="Physical address" value={sensitive(e.physical_address as string | null)} />
          <Row label="Postal address" value={sensitive(e.postal_address as string | null)} />
        </dl>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Emergency Contacts</h2>
        <ul className="space-y-2 text-sm">
          {data.contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-neutral-50 dark:border-neutral-900 pb-2">
              <div>
                <span className="font-medium text-neutral-900 dark:text-neutral-50">{c.name}</span>
                {c.is_primary && <span className="text-xs text-brand-600 ml-2">Primary</span>}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
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
          {data.contacts.length === 0 && <p className="text-sm text-neutral-400 dark:text-neutral-500">No emergency contacts on file.</p>}
        </ul>

        {canManageContacts && (
          <form action={addContact.bind(null, employeeId)} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <input name="name" placeholder="Name" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <input name="relationship" placeholder="Relationship" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <input name="phone" placeholder="Phone" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <input name="email" placeholder="Email" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" name="is_primary" /> Primary contact
            </label>
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Add contact
            </button>
          </form>
        )}
      </div>

      {canManageContacts && !isOwnProfile && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Personal details and contact info are edited from the Employees list — use &ldquo;Edit&rdquo; on{" "}
          {e.name as string}&apos;s row.
        </p>
      )}

      {isOwnProfile && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Request a change</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
            Contact and personal details go to HR for approval rather than changing immediately — you&apos;ll be
            notified once it&apos;s decided.
          </p>

          {pendingChanges.length > 0 && (
            <ul className="space-y-1.5 mb-4 text-sm">
              {pendingChanges.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-neutral-50 dark:border-neutral-900 pb-1.5">
                  <span>
                    {c.field.replace(/_/g, " ")} → <span className="font-medium">{c.new_value}</span>
                  </span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                </li>
              ))}
            </ul>
          )}

          <form action={submitProfileChangeRequest} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <select name="field" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
              {ALLOWED_FIELDS.map((f) => (
                <option key={f} value={f}>{f.replace(/_/g, " ")}</option>
              ))}
            </select>
            <input name="new_value" placeholder="New value" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <input name="reason" placeholder="Reason (optional)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <button type="submit" className="sm:col-span-3 justify-self-start bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Submit request
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-50 dark:border-neutral-900 py-1.5">
      <dt className="text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-neutral-900 dark:text-neutral-50 font-medium text-right">{value}</dd>
    </div>
  );
}
