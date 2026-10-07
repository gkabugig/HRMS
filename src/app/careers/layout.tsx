export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <main className="max-w-3xl mx-auto px-4 py-10">{children}</main>
    </div>
  );
}
