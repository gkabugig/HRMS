import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listArchivedDocuments } from "@/lib/documents/repository";
import { restoreDocument } from "@/lib/documents/lifecycle";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ArchivedDocumentsPage() {
  const supabase = await createClient();
  const documents = await listArchivedDocuments(supabase);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Archive</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Archived documents — restorable unless under legal hold or retention.</p>
        </div>
        <Link href="/dashboard/documents" className="text-xs font-medium text-brand-600 hover:underline">← Document Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-4 py-2 font-medium">Archived</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const emp = d.employees as unknown as { name: string; staff_no: string } | null;
              return (
                <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/documents/${d.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                      {d.title || d.doc_type}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400">{d.archived_at ? new Date(d.archived_at).toLocaleDateString("en-KE") : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <form action={restoreDocument.bind(null, d.id)}>
                      <button type="submit" className="text-xs text-brand-600 hover:underline">Restore</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {documents.length === 0 && (
              <tr><td colSpan={4}><EmptyState message="Nothing archived." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
