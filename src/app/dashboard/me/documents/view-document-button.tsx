"use client";

import { useState } from "react";
import { getSignedDocumentUrl } from "@/lib/documents/get-signed-document-url";
import { markDocumentViewed } from "@/lib/documents/acknowledgements";

// Client-side trigger for a server-generated signed URL (spec §9/§14:
// "private storage + signed, time-limited URLs" — the URL itself is only
// ever minted server-side, on demand, logged via logDocumentAccess, and
// opened directly rather than stored or passed through a plain <a href>
// that would otherwise need the path baked into the page's HTML.
export default function ViewDocumentButton({ documentId, versionId }: { documentId: string; versionId?: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleView() {
    setLoading(true);
    try {
      const url = await getSignedDocumentUrl(documentId, "view");
      window.open(url, "_blank", "noopener,noreferrer");
      // Opening a document is recorded as "viewed", distinct from
      // acknowledging it (spec §21) — best-effort, never blocks the view.
      if (versionId) markDocumentViewed(documentId, versionId).catch(() => {});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open this document.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleView} disabled={loading} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
      {loading ? "Opening…" : "View"}
    </button>
  );
}
