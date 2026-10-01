"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-xs font-medium bg-neutral-50 hover:bg-neutral-100 border border-[var(--border-subtle)] rounded-full px-3 py-1.5 text-neutral-700"
    >
      Download (Print to PDF)
    </button>
  );
}
