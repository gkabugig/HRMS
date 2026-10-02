import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requestDocument } from "@/lib/documents/actions";
import { uploadGovernedDocument } from "@/lib/documents/upload-actions";
import { listDocuments, getDocumentCentreStats, listDocumentTypesForOrg } from "@/lib/documents/repository";
import EmptyState from "@/components/employee-portal/empty-state";

const LEGACY_DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

const LIFECYCLE_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  review: "bg-amber-50 text-amber-700",
  approved: "bg-amber-50 text-amber-700",
  issued: "bg-emerald-50 text-emerald-700",
  acknowledged: "bg-emerald-50 text-emerald-700",
  returned: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  superseded: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
  expired: "bg-red-50 text-red-700",
  voided: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
  archived: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ lifecycle_state?: string; document_type_id?: string; search?: string }>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id, org_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  if (!isHrLike) {
    return <EmployeeDocumentsFallback employeeId={appUser?.employee_id ?? null} />;
  }

  const [documents, stats, documentTypes, { data: employees }] = await Promise.all([
    listDocuments(supabase, {
      lifecycleState: filters.lifecycle_state,
      documentTypeId: filters.document_type_id,
      search: filters.search,
    }),
    getDocumentCentreStats(supabase),
    listDocumentTypesForOrg(supabase),
    supabase.from("employees").select("id, name, staff_no").eq("status", "Active").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Document Centre</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Governed HR records — classification, versioning, approval, acknowledgement, expiry and retention.
          </p>
        </div>
        <div className="flex gap-2 text-xs font-medium">
          <Link href="/dashboard/documents/types" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">
            Types
          </Link>
          <Link href="/dashboard/documents/templates" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">
            Templates
          </Link>
          <Link href="/dashboard/documents/expiring" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">
            Expiring
          </Link>
          <Link href="/dashboard/documents/archive" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">
            Archive
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {(["draft", "review", "issued", "expired", "voided", "archived"] as const).map((state) => (
          <Link
            key={state}
            href={`/dashboard/documents?lifecycle_state=${state}`}
            className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-3 hover:border-brand-300"
          >
            <p className="text-xs text-neutral-500 dark:text-neutral-400 capitalize">{state}</p>
            <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">{stats[state] ?? 0}</p>
          </Link>
        ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Issue a document</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Document types with approval required go to review before issue; everything else is issued immediately.
        </p>
        <form action={uploadGovernedDocument} className="flex flex-wrap gap-2 text-xs items-center">
          <select name="employee_id" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">Employee…</option>
            {(employees ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.staff_no})</option>
            ))}
          </select>
          <select name="document_type_id" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">No type (legacy)…</option>
            {documentTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input name="doc_type_label" placeholder="Type label (legacy field)" defaultValue="Other" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 w-36" />
          <input name="title" placeholder="Title" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]" />
          <select name="visibility" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900" defaultValue="HR">
            <option value="HR">HR only</option>
            <option value="Manager">Manager visible</option>
            <option value="Employee">Employee visible</option>
          </select>
          <select name="sensitivity" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900" defaultValue="Confidential">
            <option value="Public">Public</option>
            <option value="Internal">Internal</option>
            <option value="Confidential">Confidential</option>
            <option value="Highly Restricted">Highly Restricted</option>
          </select>
          <input name="issue_date" type="date" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" title="Issue date" />
          <input name="expiry_date" type="date" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" title="Expiry date" />
          <input name="file" type="file" required className="text-xs border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 bg-white dark:bg-neutral-900" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
            Issue
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Request a document</h2>
        <form action={requestDocument} className="flex flex-wrap gap-2 text-xs items-center">
          <select name="employee_id" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            <option value="">Employee…</option>
            {(employees ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select name="doc_type" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
            {LEGACY_DOC_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input name="reason" placeholder="Why it's needed" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]" />
          <input name="due_date" type="date" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
          <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
            Request
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-2 items-center text-xs">
          <form className="flex gap-2">
            <input name="search" placeholder="Search title / type…" defaultValue={filters.search ?? ""} className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <select name="document_type_id" defaultValue={filters.document_type_id ?? ""} className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
              <option value="">All types</option>
              {documentTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button type="submit" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900">Filter</button>
            {(filters.lifecycle_state || filters.document_type_id || filters.search) && (
              <Link href="/dashboard/documents" className="text-neutral-500 dark:text-neutral-400 self-center hover:underline">Clear</Link>
            )}
          </form>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Lifecycle</th>
              <th className="px-4 py-2 font-medium">Sensitivity</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const emp = d.employees as unknown as { id: string; name: string; staff_no: string } | null;
              const type = d.document_types as unknown as { name: string } | null;
              return (
                <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/documents/${d.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                      {d.title || d.doc_type}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{type?.name ?? d.doc_type}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${LIFECYCLE_BADGE[d.lifecycle_state] ?? "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"}`}>
                      {d.lifecycle_state}
                      {d.legal_hold && " · hold"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 px-2 py-0.5 rounded-full">{d.sensitivity}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString("en-KE") : "—"}</td>
                </tr>
              );
            })}
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">No documents match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Fallback for a non-HR account that lands on /dashboard/documents directly
// (e.g. an old bookmark) — the real employee self-service experience is
// Area 05's /dashboard/me/documents; this just redirects there.
async function EmployeeDocumentsFallback({ employeeId }: { employeeId: string | null }) {
  if (!employeeId) {
    return <EmptyState message="No employee record is linked to this account." />;
  }
  const { redirect } = await import("next/navigation");
  redirect("/dashboard/me/documents");
}
