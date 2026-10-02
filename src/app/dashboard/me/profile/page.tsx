// Area 05 §5 "My Profile" — view permitted fields (masked for bank/national/
// statutory IDs per §14) and submit controlled change requests. Job title/
// department/manager/employment dates are HR-only master data (spec's own
// table) and Area 04 context, so they're shown read-only, sourced from
// employee_current_org_view, never editable here.
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getCurrentAssignment } from "@/lib/organisation/get-current-assignment";
import { getCurrentManager } from "@/lib/organisation/get-current-manager";
import { submitProfileChangeRequest } from "@/lib/self-service/profile-change-actions";
import { NORMAL_FIELDS, HIGH_SENSITIVITY_FIELDS, FIELD_LABELS, maskValue, type AllowedField } from "@/lib/self-service/profile-change-fields";
import EmptyState from "@/components/employee-portal/empty-state";

const STATUS_STYLE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

export default async function MyProfilePage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);

  const [{ data: employee }, orgContext, managerEmployeeId, { data: documents }, { data: changeRequests }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "name, staff_no, job_title, department, employment_type, date_of_hire, status, personal_email, phone_number, physical_address, postal_address, marital_status, nationality, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, next_of_kin_name, next_of_kin_phone, next_of_kin_relationship, bank_name, bank_account_no, bank_branch_code, national_id, passport_no, kra_pin, nssf_no, shif_no"
      )
      .eq("id", ctx.employeeId)
      .single(),
    getCurrentAssignment(supabase, ctx.employeeId),
    getCurrentManager(supabase, ctx.employeeId),
    supabase.from("employee_documents").select("id, file_name").eq("employee_id", ctx.employeeId).order("uploaded_at", { ascending: false }),
    supabase
      .from("profile_change_requests")
      .select("id, field, old_value, new_value, status, sensitivity, reason, created_at, decided_at")
      .eq("employee_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const manager = managerEmployeeId
    ? (await supabase.from("employees").select("name, job_title").eq("id", managerEmployeeId).maybeSingle()).data
    : null;

  const e = employee as Record<string, unknown> | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">My Profile</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">View your details and request changes — sensitive master data is HR-controlled.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Employment (HR-managed, read-only)</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Field label="Name" value={e?.name as string} />
          <Field label="Staff No." value={e?.staff_no as string} />
          <Field label="Job title" value={e?.job_title as string} />
          <Field label="Department / Unit" value={orgContext?.organisationUnitName ?? (e?.department as string)} />
          <Field label="Manager" value={manager ? `${manager.name} (${manager.job_title})` : "—"} />
          <Field label="Location" value={orgContext?.locationName ?? "—"} />
          <Field label="Employment type" value={e?.employment_type as string} />
          <Field label="Date of hire" value={e?.date_of_hire as string} />
          <Field label="Status" value={e?.status as string} />
        </dl>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Contact & personal details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          {NORMAL_FIELDS.map((f) => (
            <Field key={f} label={FIELD_LABELS[f]} value={(e?.[f] as string) || "—"} />
          ))}
        </dl>
        <RequestChangeForm fields={NORMAL_FIELDS} />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Bank & statutory IDs</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">Masked by default. Changes require supporting evidence and HR approval.</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
          {HIGH_SENSITIVITY_FIELDS.map((f) => (
            <Field key={f} label={FIELD_LABELS[f]} value={maskValue(e?.[f] as string)} />
          ))}
        </dl>
        <RequestChangeForm fields={HIGH_SENSITIVITY_FIELDS} documents={documents ?? []} requireEvidence />
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 p-4 pb-0">Your change requests</h2>
        {!changeRequests || changeRequests.length === 0 ? (
          <div className="p-4">
            <EmptyState message="No profile change requests yet." />
          </div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Field</th>
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">To</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {changeRequests.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{FIELD_LABELS[r.field as AllowedField] ?? r.field}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{r.old_value || "—"}</td>
                  <td className="px-4 py-2 font-medium">{r.new_value}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "bg-neutral-100 dark:bg-neutral-800"}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-KE")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="text-neutral-900 dark:text-neutral-50">{value || "—"}</dd>
    </div>
  );
}

function RequestChangeForm({
  fields,
  documents,
  requireEvidence,
}: {
  fields: readonly AllowedField[];
  documents?: { id: string; file_name: string }[];
  requireEvidence?: boolean;
}) {
  return (
    <form action={submitProfileChangeRequest} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm border-t border-neutral-100 dark:border-neutral-800 pt-4">
      <select name="field" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
        <option value="">Select field to change…</option>
        {fields.map((f) => (
          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
        ))}
      </select>
      <input name="new_value" placeholder="New value" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5" />
      <textarea name="reason" placeholder="Reason (optional)" rows={2} className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 sm:col-span-2" />
      {requireEvidence && (
        <div className="sm:col-span-2">
          <select name="evidence_document_id" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900 w-full">
            <option value="">Select evidence document…</option>
            {(documents ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.file_name}</option>
            ))}
          </select>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            No document to pick? Upload one from <a href="/dashboard/me/documents" className="text-brand-600 hover:underline">My Documents</a> first.
          </p>
        </div>
      )}
      <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium justify-self-start sm:col-span-2">
        Submit request
      </button>
    </form>
  );
}
