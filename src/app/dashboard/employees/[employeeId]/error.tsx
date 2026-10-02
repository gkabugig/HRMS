"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-2">Something went wrong loading this profile</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">Try again, or go back to the Employees list.</p>
      <button
        onClick={() => reset()}
        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
