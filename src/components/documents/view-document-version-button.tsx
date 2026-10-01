"use client";

import { useState } from "react";
import { getDocumentViewUrl } from "@/lib/documents/access-actions";

export default function ViewDocumentVersionButton({
  documentId,
  versionId,
  label = "View",
}: {
  documentId: string;
  versionId?: string | null;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleView() {
    setLoading(true);
    try {
      const url = await getDocumentViewUrl(documentId, versionId ?? null);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open this document.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleView} disabled={loading} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
      {loading ? "Opening…" : label}
    </button>
  );
}
