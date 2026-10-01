import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDocumentType } from "@/lib/documents/type-admin-actions";
import { DOCUMENT_SENSITIVITIES } from "@/lib/documents/types";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function DocumentTypesPage() {
  const supabase = await createClient();
  const { data: types } = await supabase.from("document_types").select("*").order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Document Types</h1>
          <p className="text-sm text-neutral-500">Taxonomy and per-type lifecycle configuration — approval, acknowledgement, expiry warnings, retention.</p>
        </div>
        <Link href="/dashboard/documents" className="text-xs font-medium text-brand-600 hover:underline">← Document Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">New document type</h2>
        <form action={createDocumentType} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <input name="code" placeholder="Code (e.g. employment_letter)" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <input name="name" placeholder="Display name" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <select name="default_sensitivity" defaultValue="Confidential" className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white">
            {DOCUMENT_SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input name="description" placeholder="Description (optional)" className="border border-neutral-300 rounded-lg px-2 py-1.5 sm:col-span-3" />
          <input name="expiry_warning_days_schedule" placeholder="Expiry warnings, days (e.g. 90,60,30,7)" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <input name="retention_period_months" type="number" min="0" placeholder="Retention (months)" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1"><input type="checkbox" name="approval_required" /> Approval required</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="requires_acknowledgement" /> Requires ack.</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="acknowledgement_reset_on_new_version" /> Reset ack. on new version</label>
          </div>
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium sm:col-span-3">
            Create type
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Sensitivity</th>
              <th className="px-4 py-2 font-medium">Approval</th>
              <th className="px-4 py-2 font-medium">Acknowledgement</th>
              <th className="px-4 py-2 font-medium">Expiry warnings</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {(types ?? []).map((t) => (
              <tr key={t.id} className="border-t border-neutral-100">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/documents/types/${t.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">{t.name}</Link>
                  <p className="text-xs text-neutral-400">{t.code}</p>
                </td>
                <td className="px-4 py-2">{t.default_sensitivity}</td>
                <td className="px-4 py-2">{t.approval_required ? "Required" : "—"}</td>
                <td className="px-4 py-2">{t.requires_acknowledgement ? "Required" : "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{(t.expiry_warning_days_schedule ?? []).join(", ") || "—"}</td>
                <td className="px-4 py-2">{t.is_active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {(types ?? []).length === 0 && (
              <tr><td colSpan={6}><EmptyState message="No document types configured yet." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
