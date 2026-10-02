"use client";

import { useState } from "react";
import { createShareLink } from "@/lib/documents/share-actions";

export default function CreateShareLinkForm({ documentId }: { documentId: string }) {
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const res = await createShareLink(formData);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a share link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-xs">
      <form action={handleSubmit} className="flex flex-wrap gap-2 items-center">
        <input type="hidden" name="document_id" value={documentId} />
        <select name="expires_in_hours" defaultValue="24" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 bg-white dark:bg-neutral-900">
          <option value="1">1 hour</option>
          <option value="24">24 hours</option>
          <option value="72">3 days</option>
          <option value="168">7 days</option>
        </select>
        <input name="max_views" type="number" min="1" placeholder="Max views (optional)" className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-2 py-1.5 w-40" />
        <button type="submit" disabled={loading} className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-3 py-1.5 font-medium disabled:opacity-50">
          {loading ? "Creating…" : "Create share link"}
        </button>
      </form>
      {error && <p className="text-red-600 mt-2">{error}</p>}
      {result && (
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">
          Link (expires {new Date(result.expiresAt).toLocaleString("en-KE")}):{" "}
          <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded break-all">{result.url}</code>
        </p>
      )}
    </div>
  );
}
