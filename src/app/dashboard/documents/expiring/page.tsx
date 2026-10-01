import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listExpiringDocuments } from "@/lib/documents/repository";
import EmptyState from "@/components/employee-portal/empty-state";

export default async function ExpiringDocumentsPage() {
  const supabase = await createClient();
  const documents = await listExpiringDocuments(supabase, 90);
  const today = new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Expiry Watch</h1>
          <p className="text-sm text-neutral-500">Documents expiring within 90 days, or already expired.</p>
        </div>
        <Link href="/dashboard/documents" className="text-xs font-medium text-brand-600 hover:underline">← Document Centre</Link>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Employee</th>
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-4 py-2 font-medium">Expiry date</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const emp = d.employees as unknown as { name: string; staff_no: string } | null;
              const expiry = d.expiry_date ? new Date(d.expiry_date) : null;
              const daysLeft = expiry ? Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <tr key={d.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{emp ? `${emp.name} (${emp.staff_no})` : "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/dashboard/documents/${d.id}`} className="text-brand-600 hover:text-brand-700 hover:underline">
                      {d.title || d.doc_type}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{d.expiry_date ? new Date(d.expiry_date).toLocaleDateString("en-KE") : "—"}</td>
                  <td className="px-4 py-2">
                    {daysLeft !== null && daysLeft < 0 ? (
                      <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">Overdue {Math.abs(daysLeft)}d</span>
                    ) : (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{daysLeft}d left</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {documents.length === 0 && (
              <tr><td colSpan={4}><EmptyState message="Nothing expiring in the next 90 days." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
