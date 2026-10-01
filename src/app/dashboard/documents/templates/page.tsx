import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createDocumentTemplate, updateDocumentTemplate } from "@/lib/documents/template-admin-actions";
import { generateFromTemplateAction } from "@/lib/documents/upload-actions";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function DocumentTemplatesPage() {
  const supabase = await createClient();
  const [{ data: templates }, { data: types }, { data: employees }] = await Promise.all([
    supabase.from("document_templates").select("*, document_types(name)").order("name"),
    supabase.from("document_types").select("id, name").order("name"),
    supabase.from("employees").select("id, name, staff_no").eq("status", "Active").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Document Templates</h1>
          <p className="text-sm text-neutral-500">
            Plain <code className="bg-neutral-100 px-1 rounded">{"{{variable}}"}</code> substitution only — no code execution. Generated
            output becomes a governed document, subject to the same approval/issue rules as any upload.
          </p>
        </div>
        <Link href="/dashboard/documents" className="text-xs font-medium text-brand-600 hover:underline">← Document Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">New template</h2>
        <p className="text-xs text-neutral-500 mb-2">
          Available variables: {"{{employee_name}}"}, {"{{staff_no}}"}, {"{{department}}"}, {"{{job_title}}"}, {"{{start_date}}"},{" "}
          {"{{organisation_name}}"}, {"{{today}}"}, plus {"{{new_title}}"}, {"{{new_department}}"}, {"{{effective_date_label}}"}, {"{{reason}}"} filled in at generation time.
        </p>
        <form action={createDocumentTemplate} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <input name="code" placeholder="Code (e.g. promotion_letter)" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <input name="name" placeholder="Display name" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
          <select name="document_type_id" className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white sm:col-span-2">
            <option value="">No type</option>
            {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <textarea name="body" required rows={6} placeholder="Dear {{employee_name}}, ..." className="border border-neutral-300 rounded-lg px-2 py-1.5 sm:col-span-2 font-mono" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium sm:col-span-2">
            Create template
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {(templates ?? []).map((t) => {
          const type = t.document_types as unknown as { name: string } | null;
          return (
            <div key={t.id} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">{t.name} <span className="text-xs text-neutral-400">v{t.version}</span></h3>
                  <p className="text-xs text-neutral-500">{type?.name ?? "No type"} · {t.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>
              <details className="mb-3">
                <summary className="text-xs text-neutral-600 cursor-pointer">Edit template</summary>
                <form action={updateDocumentTemplate.bind(null, t.id)} className="mt-2 grid grid-cols-1 gap-2 text-xs">
                  <input name="name" defaultValue={t.name} required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
                  <select name="document_type_id" defaultValue={t.document_type_id ?? ""} className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white">
                    <option value="">No type</option>
                    {(types ?? []).map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                  </select>
                  <textarea name="body" defaultValue={t.body} required rows={6} className="border border-neutral-300 rounded-lg px-2 py-1.5 font-mono" />
                  <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={t.is_active} /> Active</label>
                  <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium w-fit">Save</button>
                </form>
              </details>
              <details>
                <summary className="text-xs text-neutral-600 cursor-pointer">Generate a document from this template</summary>
                <form action={generateFromTemplateAction} className="mt-2 flex flex-wrap gap-2 items-center text-xs">
                  <input type="hidden" name="template_id" value={t.id} />
                  <select name="employee_id" required className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white">
                    <option value="">Employee…</option>
                    {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.staff_no})</option>)}
                  </select>
                  <input name="title" placeholder="Document title" required className="border border-neutral-300 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]" />
                  <input name="new_title" placeholder="{{new_title}}" className="border border-neutral-300 rounded-lg px-2 py-1.5 w-32" />
                  <input name="effective_date_label" placeholder="{{effective_date_label}}" className="border border-neutral-300 rounded-lg px-2 py-1.5 w-40" />
                  <input name="effective_date" type="date" className="border border-neutral-300 rounded-lg px-2 py-1.5" title="Effective date" />
                  <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
                    Generate
                  </button>
                </form>
              </details>
            </div>
          );
        })}
        {(templates ?? []).length === 0 && <EmptyState message="No templates yet." />}
      </div>
    </div>
  );
}
