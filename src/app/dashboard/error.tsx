"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Something went wrong loading the dashboard</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">Try again, or use the menu on the left to reach a specific module.</p>
      {error.message && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-5 font-mono break-words bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 text-left">
          {error.message}
          {error.digest && <span className="block mt-1 text-neutral-300 dark:text-neutral-600">digest: {error.digest}</span>}
        </p>
      )}
      <button
        onClick={() => reset()}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
