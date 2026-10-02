// Area 12 §9.7 RAG source registry management — HR/admin only.
import { createClient } from "@/lib/supabase/server";
import { createKnowledgeSource, setKnowledgeSourceActive } from "@/lib/ai/knowledge-actions";

export default async function KnowledgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user!.id).maybeSingle();

  if (appUser?.role !== "admin" && appUser?.role !== "hr") {
    return <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl p-6 text-sm text-neutral-600 dark:text-neutral-300">Policy knowledge management is visible to HR and admin roles.</div>;
  }

  const { data: sources } = await supabase
    .from("ai_knowledge_sources")
    .select("id, title, source_type, classification, is_active, created_at, ai_knowledge_chunks(count)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">AI Assistant — Policy Knowledge</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Paste approved HR policy, handbook or procedure text. It is chunked and indexed for the assistant&apos;s policy search tool, with every answer traceable back to the source
          you add here.
        </p>
      </div>

      <form action={createKnowledgeSource} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input name="title" placeholder="Title (e.g. Leave Policy 2026)" required className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <select name="source_type" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm">
            <option value="policy_document">Policy document</option>
            <option value="handbook">Handbook</option>
            <option value="faq">FAQ</option>
            <option value="procedure">Procedure</option>
          </select>
        </div>
        <select name="classification" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm">
          <option value="internal">Internal (any employee can retrieve)</option>
          <option value="public">Public</option>
          <option value="restricted">Restricted (HR/admin only)</option>
        </select>
        <textarea name="content" required rows={8} placeholder="Paste the document text here…" className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm font-mono" />
        <button type="submit" className="text-sm bg-brand-600 text-white rounded-lg px-4 py-2 hover:bg-brand-700">
          Index document
        </button>
      </form>

      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Classification</th>
              <th className="text-left px-4 py-2">Chunks</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {(sources ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 font-medium text-neutral-900 dark:text-neutral-50">{s.title}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{s.source_type}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{s.classification}</td>
                <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{(s.ai_knowledge_chunks as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                <td className="px-4 py-2">{s.is_active ? <span className="text-green-700">Active</span> : <span className="text-neutral-400 dark:text-neutral-500">Inactive</span>}</td>
                <td className="px-4 py-2 text-right">
                  <form action={setKnowledgeSourceActive.bind(null, s.id, !s.is_active)}>
                    <button className="text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1 hover:bg-neutral-50 hover:dark:bg-neutral-900">{s.is_active ? "Deactivate" : "Activate"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {(sources ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400 dark:text-neutral-500">
                  No policy sources indexed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
