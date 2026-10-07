import Link from "next/link";
import type { ReactNode } from "react";

// Shared building blocks so the employee and manager homes carry the same
// look as the admin/HR command centre: greeting header, gradient stat cards
// with a coloured edge, and clickable tiles that open the source tab.

const ACCENTS = ["var(--vivid-1)", "var(--vivid-3)", "var(--vivid-4)", "var(--vivid-2)", "var(--vivid-5)", "var(--vivid-6)", "var(--vivid-7)", "var(--vivid-8)"];

export function accentAt(i: number) {
  return ACCENTS[i % ACCENTS.length];
}

function greeting(): string {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function RoleHeader({ name, subtitle }: { name: string; subtitle?: string }) {
  const dateLabel = new Date().toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric", timeZone: "Africa/Nairobi" });
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">
          {greeting()}, {name}
        </h1>
        {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{subtitle}</p>}
      </div>
      <span className="text-sm text-neutral-400 dark:text-neutral-500">{dateLabel}</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  noteTone = "muted",
  href,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  noteTone?: "muted" | "warn" | "good";
  href?: string;
  index?: number;
}) {
  const accent = accentAt(index);
  const toneClass = noteTone === "warn" ? "text-amber-600" : noteTone === "good" ? "text-emerald-600" : "text-neutral-500 dark:text-neutral-400";
  const body = (
    <div
      className="relative overflow-hidden bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm shadow-slate-900/[0.03] p-5 h-full transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 10%, var(--surface)), var(--surface) 65%)` }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">{label}</div>
      <div className="text-[28px] leading-tight font-semibold text-neutral-900 dark:text-neutral-50 tracking-tight">{value}</div>
      {note && <div className={`mt-2 text-xs font-medium ${toneClass}`}>{note}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>;
}

export function QuickLinks({ links }: { links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l, i) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          className="text-xs font-medium rounded-full px-3 py-1.5 border transition-colors hover:brightness-95"
          style={{
            color: accentAt(i),
            background: `color-mix(in srgb, ${accentAt(i)} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${accentAt(i)} 30%, transparent)`,
          }}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
