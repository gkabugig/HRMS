import type { Employee360 } from "@/lib/employees/get-employee-360";
import { addContact, deleteContact } from "../actions";

export function BioTab({
  data,
  employeeId,
  canManageContacts,
}: {
  data: Employee360;
  employeeId: string;
  canManageContacts: boolean;
}) {
  const e = data.employee;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Personal Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row
            label="Date of birth"
            value={
              e.date_of_birth
                ? new Date(e.date_of_birth as string).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })
                : "Not on file"
            }
          />
          <Row label="Gender" value={(e.gender as string) || "Not on file"} />
          <Row label="Marital status" value={(e.marital_status as string) || "Not on file"} />
          <Row label="Nationality" value={(e.nationality as string) || "Not on file"} />
          <Row label="National ID" value={(e.national_id as string) || "Not on file"} />
          <Row label="Passport no." value={(e.passport_no as string) || "Not on file"} />
        </dl>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Contact Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <Row label="Phone number" value={(e.phone_number as string) || "Not on file"} />
          <Row label="Personal email" value={(e.personal_email as string) || "Not on file"} />
          <Row label="Physical address" value={(e.physical_address as string) || "Not on file"} />
          <Row label="Postal address" value={(e.postal_address as string) || "Not on file"} />
        </dl>
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
          {data.contacts.length === 0 && <p className="text-sm text-neutral-400">No emergency contacts on file.</p>}
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

      {canManageContacts && (
        <p className="text-xs text-neutral-400">
          Personal details and contact info are edited from the Employees list — use &ldquo;Edit&rdquo; on{" "}
          {e.name as string}&apos;s row.
        </p>
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
