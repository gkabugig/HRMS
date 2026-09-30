export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-9 w-64 bg-neutral-100 rounded mb-2" />
        <div className="h-4 w-48 bg-neutral-100 rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
        <div className="h-64 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
        ))}
      </div>
      <div className="h-40 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl" />
    </div>
  );
}
