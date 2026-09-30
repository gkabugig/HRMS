import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument } from "./actions";
import { requestDocument, fulfilDocumentRequest } from "@/lib/documents/actions";

const DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

export default async function DocumentsPage() {
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

  const [{ data: documents }, { data: employees }, { data: openRequests }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, employee_id, doc_type, file_path, file_name, uploaded_at, sensitivity, status, employees(name, staff_no)")
      .eq("status", "Active")
      .order("uploaded_at", { ascending: false }),
    isHrLike
      ? supabase.from("employees").select("id, name, staff_no").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
    appUser?.employee_id
      ? supabase
          .from("document_requests")
          .select("id, doc_type, reason, due_date")
          .eq("employee_id", appUser.employee_id)
          .eq("status", "Requested")
      : Promise.resolve({ data: null }),
  ]);

  // Every signed URL issued here is a document being made viewable, so it's
  // logged as access (spec §6.3 — "access to confidential documents should
  // itself be auditable") the same moment the link is generated, not only
  // if the link is clicked.
  const withSignedUrls = await Promise.all(
    (documents ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage.from("employee-documents").createSignedUrl(d.file_path, 3600);
      if (signed?.signedUrl && user) {
        await supabase.from("document_access_logs").insert({ document_id: d.id, accessed_by: user.id, action: "view" });
      }
      return { ...d, url: signed?.signedUrl ?? null };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">{isHrLike ? "Documents" : "My Documents"}</h1>
        <p className="text-sm text-neutral-500">
          Contracts, ID copies, certificates — stored in a private bucket, visible only to HR/admin and
          the employee themselves.
        </p>
      </div>

      {!isHrLike && (openRequests ?? []).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Requested from you</h2>
          <ul className="space-y-3">
            {(openRequests ?? []).map((r) => (
              <li key={r.id} className="text-sm">
                <p className="font-medium text-neutral-900">{r.doc_type}</p>
                <p className="text-xs text-neutral-600 mb-2">
                  {r.reason} {r.due_date && `· due ${new Date(r.due_date).toLocaleDateString("en-KE")}`}
                </p>
                <form action={fulfilDocumentRequest.bind(null, r.id)} className="flex items-center gap-2">
                  <input name="file" type="file" required className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white" />
                  <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 text-xs font-medium">
                    Upload
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isHrLike && (employees ?? []).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Upload a document</h2>
          <p className="text-xs text-neutral-500 mb-3">Pick an employee below to upload a document for them.</p>
          <EmployeeUploadForms employees={employees ?? []} />
        </div>
      )}

      {isHrLike && (employees ?? []).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Request a document</h2>
          <p className="text-xs text-neutral-500 mb-3">Ask an employee to upload something specific — they&apos;ll see it on their own Documents page.</p>
          <form action={requestDocument} className="flex flex-wrap gap-2 text-xs items-center">
            <select name="employee_id" required className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="">Employee…</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <select name="doc_type" className="border border-neutral-300 rounded-lg px-2 py-1.5 bg-white">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input name="reason" placeholder="Why it's needed" required className="border border-neutral-300 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]" />
            <input name="due_date" type="date" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Request
            </button>
          </form>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {isHrLike && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Sensitivity</th>
              <th className="px-4 py-2 font-medium">Uploaded</th>
              {isHrLike && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {withSignedUrls.map((d) => {
              const emp = d.employees as unknown as { name: string; staff_no: string } | null;
              return (
                <tr key={d.id} className="border-t border-neutral-100">
                  {isHrLike && <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>}
                  <td className="px-4 py-2">{d.doc_type}</td>
                  <td className="px-4 py-2">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 hover:underline">
                        {d.file_name}
                      </a>
                    ) : (
                      <span className="text-neutral-400">{d.file_name} (link unavailable)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{d.sensitivity}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{new Date(d.uploaded_at).toLocaleDateString("en-KE")}</td>
                  {isHrLike && (
                    <td className="px-4 py-2">
                      <form action={deleteDocument.bind(null, d.id, d.file_path, d.employee_id)}>
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {withSignedUrls.length === 0 && (
              <tr>
                <td colSpan={isHrLike ? 6 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Per-employee upload forms, one <details> each, so no client JS is needed
// to route the uploaded file's Server Action to the right employee id.
function EmployeeUploadForms({ employees }: { employees: { id: string; name: string; staff_no: string }[] }) {
  return (
    <div className="space-y-2">
      {employees.map((e) => (
        <details key={e.id} className="border border-neutral-200 rounded-lg px-3 py-2">
          <summary className="text-xs text-neutral-700 cursor-pointer">
            Upload for {e.name} ({e.staff_no})
          </summary>
          <form action={uploadDocument.bind(null, e.id)} className="mt-2 flex flex-wrap gap-2 items-center text-xs">
            <select name="doc_type" className="border border-neutral-300 rounded-lg px-2 py-1">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input name="file" type="file" required className="text-xs border border-neutral-300 rounded px-2 py-1" />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Upload
            </button>
          </form>
        </details>
      ))}
    </div>
  );
}
