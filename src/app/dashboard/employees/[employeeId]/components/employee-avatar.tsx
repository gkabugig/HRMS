function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EmployeeAvatar({
  name,
  photoUrl,
  size = 112,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public, externally-hosted (Supabase Storage) URL; next/image's remote-pattern config isn't worth it for one small avatar.
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-2xl object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  );
}
