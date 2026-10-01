// Area 05 §9 "My Documents" — categories, lifecycle flags, expiry alerts,
// upload (self-service, migration 0066 RLS fix), acknowledgements
// (migration 0064), and signed time-limited view links
// (get-signed-document-url.ts). Uploading into an unapproved category isn't
// possible — the <select> only offers SELF_SERVICE_DOC_TYPES.
import { createClient } from "@/lib/supabase/server";
import { requireEmployeeContext } from "@/lib/employee-portal/require-employee-context";
import { getMyDocuments } from "@/lib/employee-portal/get-my-documents";
import { uploadMyDocument } from "@/lib/employee-portal/documents-actions";
import { acknowledgeDocumentVersion, declineDocumentAcknowledgement } from "@/lib/documents/acknowledgements";
import EmptyState from "@/components/employee-portal/empty-state";
import ViewDocumentButton from "./view-document-button";

const LIFECYCLE_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  expiring: "bg-amber-100 text-amber-700",
  expired: "bg-red-100 text-red-700",
  archived: "bg-neutral-100 text-neutral-400",
  superseded: "bg-neutral-100 text-neutral-400",
};

export default async function MyDocumentsPage() {
  const supabase = await createClient();
  const ctx = await requireEmployeeContext(supabase);
  const documents = await getMyDocuments(supabase, ctx.employeeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">My Documents</h1>
        <p className="text-sm text-neutral-500 mt-1">Your HR documents, with expiry alerts and required acknowledgements.</p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-3">Upload a document</h2>
        <form
          action={async (formData: FormData) => {
            "use server";
            await uploadMyDocument(formData);
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm"
        >
          <select name="doc_type" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white">
            <option value="ID Copy">ID Copy</option>
            <option value="Bank Letter">Bank Letter</option>
            <option value="Certificate">Certificate</option>
            <option value="Evidence">Evidence (for a change request)</option>
            <option value="Other">Other</option>
          </select>
          <input type="file" name="file" required className="border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 bg-white" />
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium justify-self-start sm:col-span-2">
            Upload
          </button>
        </form>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <h2 className="text-sm font-semibold text-neutral-900 p-4 pb-0">Your documents</h2>
        {documents.length === 0 ? (
          <div className="p-4"><EmptyState message="No documents on file yet." /></div>
        ) : (
          <table className="w-full text-sm mt-3">
            <thead className="bg-neutral-50 text-neutral-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Document</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Expiry</th>
                <th className="px-4 py-2 font-medium">Lifecycle</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{d.title || d.fileName}</td>
                  <td className="px-4 py-2 text-neutral-500">{d.docType}</td>
                  <td className="px-4 py-2 text-neutral-500">{d.expiryDate ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LIFECYCLE_STYLE[d.lifecycle] ?? "bg-neutral-100"}`}>{d.lifecycle}</span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <ViewDocumentButton documentId={d.id} versionId={d.currentVersionId} />
                    {d.requiresAcknowledgement && d.acknowledgementStatus !== "acknowledged" && d.acknowledgementStatus !== "declined" && (
                      <>
                        <form
                          action={async () => {
                            "use server";
                            await acknowledgeDocumentVersion(d.id, d.currentVersionId);
                          }}
                          className="inline"
                        >
                          <button className="text-xs font-medium text-amber-700 hover:underline">Acknowledge</button>
                        </form>
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await declineDocumentAcknowledgement(d.id, d.currentVersionId, String(formData.get("reason") || ""));
                          }}
                          className="inline-flex items-center gap-1"
                        >
                          <input name="reason" placeholder="Reason" className="border border-neutral-300 rounded px-1.5 py-0.5 text-xs w-24" />
                          <button className="text-xs font-medium text-red-600 hover:underline">Decline</button>
                        </form>
                      </>
                    )}
                    {d.acknowledgementStatus === "acknowledged" && <span className="text-xs text-green-700">Acknowledged</span>}
                    {d.acknowledgementStatus === "declined" && (
                      <span className="text-xs text-red-700" title={d.declineReason ?? undefined}>Declined</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
