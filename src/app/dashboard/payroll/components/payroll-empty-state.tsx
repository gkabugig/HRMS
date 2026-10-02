export default function PayrollEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-12 text-neutral-400 dark:text-neutral-500">
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">{title}</p>
      <p className="text-xs mt-1">{description}</p>
    </div>
  );
}
