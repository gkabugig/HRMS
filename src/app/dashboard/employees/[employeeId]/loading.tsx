export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-6">
        <div className="h-3 w-24 bg-neutral-100 rounded mb-4" />
        <div className="flex gap-4">
          <div className="h-[72px] w-[72px] rounded-2xl bg-neutral-100 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-6 w-56 bg-neutral-100 rounded" />
            <div className="h-3 w-72 bg-neutral-100 rounded" />
            <div className="h-3 w-64 bg-neutral-100 rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
