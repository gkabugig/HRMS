import type { Employee360 } from "@/lib/employees/get-employee-360";
import { uploadDocument, deleteDocument } from "@/app/dashboard/documents/actions";

const DOC_TYPES = ["Contract", "ID Copy", "KRA Certificate", "Academic Certificate", "Other"];

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24));
}

export function DocumentsTab({ data, employeeId, canUpload }: { data: Employee360; employeeId: string; canUpload: boolean }) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Expiry</th>
              <th className="px-4 py-2 font-medium">Visibility</th>
              {canUpload && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {data.documents.map((d) => {
              const days = d.expiry_date ? daysUntil(d.expiry_date) : null;
              return (
                <tr key={d.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{d.document_type}</td>
                  <td className="px-4 py-2">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 hover:underline">
                        {d.title}
                      </a>
                    ) : (
                      <span className="text-neutral-400">{d.title} (link unavailable)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {d.expiry_date ?? "—"}
                    {days !== null && days <= 30 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ml-1 ${days < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {days < 0 ? "Expired" : `${days}d`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{d.visibility}</td>
                  {canUpload && (
                    <td className="px-4 py-2">
                      <form action={deleteDocument.bind(null, d.id, d.file_path, employeeId)}>
                        <button type="submit" className="text-xs text-red-600 hover:underline">
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
            {data.documents.length === 0 && (
              <tr>
                <td colSpan={canUpload ? 5 : 4} className="px-4 py-6 text-center text-neutral-400">
                  No documents on file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canUpload && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">Upload a document</h2>
          <form action={uploadDocument.bind(null, employeeId)} className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <select name="doc_type" className="border border-neutral-300 rounded-lg px-2 py-1.5">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select name="visibility" defaultValue="HR" className="border border-neutral-300 rounded-lg px-2 py-1.5">
              <option value="HR">HR only</option>
              <option value="Manager">Manager visible</option>
              <option value="Employee">Employee visible</option>
            </select>
            <input name="file" type="file" required className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            <label className="flex flex-col gap-1 text-neutral-500">
              Issue date
              <input name="issue_date" type="date" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1 text-neutral-500">
              Expiry date
              <input name="expiry_date" type="date" className="border border-neutral-300 rounded-lg px-2 py-1.5" />
            </label>
            <button type="submit" className="self-end bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Upload
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
