import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDocumentDetail } from "@/lib/documents/repository";
import { getDocumentTimeline } from "@/lib/documents/events";
import { voidDocument, archiveDocument } from "@/lib/documents/lifecycle";
import { uploadNewVersion } from "@/lib/documents/upload-actions";
import { updateDocumentRetention } from "@/lib/documents/retention-actions";
import { revokeShareLink } from "@/lib/documents/share-actions";
import ViewDocumentVersionButton from "@/components/documents/view-document-version-button";
import CreateShareLinkForm from "@/components/documents/create-share-link-form";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const supabase = await createClient();
  const { data: appUser } = await supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) return { data: null };
    return supabase.from("app_users").select("role").eq("id", data.user.id).maybeSingle();
  });
  const isHrLike = appUser?.role === "admin" || appUser?.role === "hr";

  let detail;
  try {
    detail = await getDocumentDetail(supabase, documentId);
  } catch {
    notFound();
  }
  const { doc, versions, acknowledgements, shares } = detail;
  const timeline = await getDocumentTimeline(supabase, documentId);

  const employee = doc.employees as unknown as { id: string; name: string; staff_no: string } | null;
  const docType = doc.document_types as unknown as { id: string; name: string; requires_acknowledgement: boolean } | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{doc.title || doc.doc_type}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {employee ? `${employee.name} (${employee.staff_no})` : "—"} · {docType?.name ?? doc.doc_type} · {doc.sensitivity}
          </p>
        </div>
        <Link href="/dashboard/documents" className="text-xs font-medium text-brand-600 hover:underline">← Document Centre</Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Lifecycle" value={doc.lifecycle_state} />
        <StatCard label="Issue date" value={doc.issue_date ? new Date(doc.issue_date).toLocaleDateString("en-KE") : "—"} />
        <StatCard label="Expiry date" value={doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString("en-KE") : "—"} />
        <StatCard label="Legal hold" value={doc.legal_hold ? "Yes" : "No"} />
      </div>

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 flex flex-wrap gap-3 items-center">
          {doc.current_version_id && <ViewDocumentVersionButton documentId={documentId} label="View current version" />}
          {!["voided", "archived"].includes(doc.lifecycle_state) && (
            <form action={async (formData: FormData) => {
              "use server";
              await voidDocument(documentId, String(formData.get("reason") || ""));
            }} className="flex items-center gap-2">
              <input name="reason" placeholder="Reason to void" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 text-xs" />
              <button type="submit" className="text-xs text-red-600 hover:underline">Void</button>
            </form>
          )}
          {doc.lifecycle_state !== "archived" && (
            <form action={archiveDocument.bind(null, documentId)}>
              <button type="submit" className="text-xs text-neutral-600 dark:text-neutral-300 hover:underline">Archive</button>
            </form>
          )}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Versions</h2>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 dark:text-neutral-400 text-left">
            <tr>
              <th className="py-1 font-medium">#</th>
              <th className="py-1 font-medium">File</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Uploaded</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100 dark:border-neutral-800">
                <td className="py-1">{v.version_number}</td>
                <td className="py-1">{v.file_name}</td>
                <td className="py-1 capitalize">{v.status}</td>
                <td className="py-1 text-neutral-500 dark:text-neutral-400">{new Date(v.uploaded_at).toLocaleDateString("en-KE")}</td>
                <td className="py-1"><ViewDocumentVersionButton documentId={documentId} versionId={v.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {isHrLike && !doc.legal_hold && doc.lifecycle_state !== "archived" && doc.lifecycle_state !== "voided" && (
          <form action={uploadNewVersion.bind(null, documentId, doc.employee_id)} className="mt-3 flex flex-wrap gap-2 items-center text-xs">
            <input name="file" type="file" required className="border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 bg-white dark:bg-neutral-900" />
            <input name="notes" placeholder="Notes (optional)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 flex-1 min-w-[140px]" />
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">
              Upload new version
            </button>
          </form>
        )}
      </div>

      {docType?.requires_acknowledgement && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Acknowledgement</h2>
          {acknowledgements.length === 0 ? (
            <EmptyState message="Not yet requested." />
          ) : (
            <ul className="space-y-1 text-sm">
              {acknowledgements.map((a) => {
                const ackEmployee = a.employees as unknown as { name: string } | null;
                return (
                  <li key={a.id} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1 last:border-0">
                    <span>{ackEmployee?.name ?? "—"}</span>
                    <span className="text-xs capitalize text-neutral-500 dark:text-neutral-400">
                      {a.status}
                      {a.declined_at && a.decline_reason && ` — ${a.decline_reason}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Retention &amp; legal hold</h2>
          <form action={updateDocumentRetention} className="flex flex-wrap gap-2 items-center text-xs">
            <input type="hidden" name="document_id" value={documentId} />
            <input name="retention_until" type="date" defaultValue={doc.retention_until ?? ""} className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5" />
            <label className="flex items-center gap-1"><input type="checkbox" name="legal_hold" defaultChecked={doc.legal_hold} /> Legal hold</label>
            <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium">Save</button>
          </form>
        </div>
      )}

      {isHrLike && (
        <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Temporary shares</h2>
          <CreateShareLinkForm documentId={documentId} />
          {shares.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-1 last:border-0">
                  <span className="text-neutral-600 dark:text-neutral-300">
                    Expires {new Date(s.expires_at).toLocaleString("en-KE")} · {s.view_count} view(s){s.revoked_at && " · revoked"}
                  </span>
                  {!s.revoked_at && (
                    <form action={revokeShareLink.bind(null, s.id, documentId)}>
                      <button type="submit" className="text-red-600 hover:underline">Revoke</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Timeline</h2>
        {timeline.length === 0 ? (
          <EmptyState message="No events recorded yet." />
        ) : (
          <ul className="space-y-2 text-sm">
            {timeline.map((e) => (
              <li key={e.id} className="border-b border-neutral-100 dark:border-neutral-800 pb-2 last:border-0">
                <p className="text-neutral-900 dark:text-neutral-50">{e.eventType.replace("document.", "").replace(/_/g, " ")}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {e.actorName ?? "System"} · {new Date(e.createdAt).toLocaleString("en-KE")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 capitalize">{value}</p>
    </div>
  );
}
