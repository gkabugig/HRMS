import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateDocumentType } from "@/lib/documents/type-admin-actions";
import { DOCUMENT_SENSITIVITIES } from "@/lib/documents/types";

export default async function DocumentTypeDetailPage({ params }: { params: Promise<{ typeId: string }> }) {
  const { typeId } = await params;
  const supabase = await createClient();
  const { data: type } = await supabase.from("document_types").select("*").eq("id", typeId).maybeSingle();
  if (!type) notFound();

  const { count: documentCount } = await supabase
    .from("employee_documents")
    .select("id", { count: "exact", head: true })
    .eq("document_type_id", typeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{type.name}</h1>
        <Link href="/dashboard/documents/types" className="text-xs font-medium text-brand-600 hover:underline">← All types</Link>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{documentCount ?? 0} document(s) use this type.</p>

      <form action={updateDocumentType.bind(null, typeId)} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <input name="name" defaultValue={type.name} required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
        <select name="default_sensitivity" defaultValue={type.default_sensitivity} className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
          {DOCUMENT_SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={type.is_active} /> Active</label>
        <input name="description" defaultValue={type.description ?? ""} placeholder="Description" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 sm:col-span-3" />
        <input name="expiry_warning_days_schedule" defaultValue={(type.expiry_warning_days_schedule ?? []).join(",")} placeholder="Expiry warnings, days" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
        <input name="retention_period_months" type="number" min="0" defaultValue={type.retention_period_months ?? ""} placeholder="Retention (months)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1"><input type="checkbox" name="approval_required" defaultChecked={type.approval_required} /> Approval required</label>
        </div>
        <div className="flex items-center gap-3 sm:col-span-3">
          <label className="flex items-center gap-1"><input type="checkbox" name="requires_acknowledgement" defaultChecked={type.requires_acknowledgement} /> Requires acknowledgement</label>
          <label className="flex items-center gap-1"><input type="checkbox" name="acknowledgement_reset_on_new_version" defaultChecked={type.acknowledgement_reset_on_new_version} /> Reset acknowledgement on new version</label>
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium sm:col-span-3">
          Save changes
        </button>
      </form>
    </div>
  );
}
