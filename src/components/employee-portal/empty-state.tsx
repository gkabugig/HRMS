// Spec §23 "every empty state explains the next action" — one small shared
// component instead of a bespoke "nothing here" paragraph on every card.
export default function EmptyState({ message, actionLabel, actionHref }: { message: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="text-center py-6 text-sm text-neutral-400">
      <p>{message}</p>
      {actionLabel && actionHref && (
        <a href={actionHref} className="inline-block mt-2 text-brand-600 hover:text-brand-700 font-medium">
          {actionLabel}
        </a>
      )}
    </div>
  );
}
