"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 hover:bg-neutral-50 hover:dark:bg-neutral-900 transition-colors"
    >
      Print / Save as PDF
    </button>
  );
}
