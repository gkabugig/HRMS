import { createClient } from "@/lib/supabase/server";
import { uploadDocument, deleteDocument } from "./actions";

const DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  const [{ data: documents }, { data: employees }] = await Promise.all([
    supabase
      .from("employee_documents")
      .select("id, employee_id, doc_type, file_path, file_name, uploaded_at, employees(name, staff_no)")
      .order("uploaded_at", { ascending: false }),
    isHrLike
      ? supabase.from("employees").select("id, name, staff_no").eq("status", "Active").order("name")
      : Promise.resolve({ data: null }),
  ]);

  const withSignedUrls = await Promise.all(
    (documents ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage.from("employee-documents").createSignedUrl(d.file_path, 3600);
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

      {isHrLike && (employees ?? []).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Upload a document</h2>
          <p className="text-xs text-neutral-500 mb-3">Pick an employee below to upload a document for them.</p>
          <EmployeeUploadForms employees={employees ?? []} />
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              {isHrLike && <th className="px-4 py-2 font-medium">Employee</th>}
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
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
                  <td className="px-4 py-2 text-neutral-500">{new Date(d.uploaded_at).toLocaleDateString("en-KE")}</td>
                  {isHrLike && (
                    <td className="px-4 py-2">
                      <form action={deleteDocument.bind(null, d.id, d.file_path)}>
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
                <td colSpan={isHrLike ? 5 : 3} className="px-4 py-6 text-center text-neutral-400">
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
