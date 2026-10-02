export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-800 rounded mb-3" />
        <div className="h-7 w-64 bg-neutral-100 dark:bg-neutral-800 rounded mb-2" />
        <div className="h-4 w-48 bg-neutral-100 dark:bg-neutral-800 rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
        ))}
      </div>
      <div className="h-24 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-48 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
        <div className="h-48 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
      </div>
      <div className="h-64 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
    </div>
  );
}
