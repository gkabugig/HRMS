export default function AuditTrail({
  events,
}: {
  events: { id: string; eventType: string; actorName: string | null; reason: string | null; createdAt: string }[];
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">Audit Trail</h2>
      {events.length === 0 ? (
        <p className="text-sm text-neutral-400">No events recorded yet.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 mt-1 shrink-0" />
              <span className="flex-1 text-neutral-600">
                <span className="font-medium text-neutral-800">{e.eventType.replace(/_/g, " ")}</span>
                {e.actorName && <span> by {e.actorName}</span>}
                {e.reason && <span className="text-neutral-400"> — &ldquo;{e.reason}&rdquo;</span>}
              </span>
              <span className="text-neutral-400 shrink-0">{new Date(e.createdAt).toLocaleString("en-KE")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
