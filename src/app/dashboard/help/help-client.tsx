"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { HelpArticle } from "@/lib/help/articles";

export default function HelpClient({ articles }: { articles: HelpArticle[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = term
      ? articles.filter((a) => `${a.title} ${a.summary} ${a.category} ${a.steps.join(" ")}`.toLowerCase().includes(term))
      : articles;
    const map = new Map<string, HelpArticle[]>();
    for (const a of matches) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return [...map.entries()];
  }, [articles, q]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help, e.g. payroll, leave, GPS"
          className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {grouped.length === 0 && <p className="text-sm text-neutral-400 dark:text-neutral-500">Nothing matches &ldquo;{q}&rdquo;. Try a different word.</p>}

      {grouped.map(([category, items]) => (
        <div key={category} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50 mb-2">{category}</h2>
          <ul>
            {items.map((a) => {
              const isOpen = open === a.id || q.trim() !== "";
              return (
                <li key={a.id} className="border-t border-neutral-100 dark:border-neutral-800 first:border-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(open === a.id ? null : a.id)}
                    className="w-full text-left py-2.5"
                  >
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{a.summary}</p>
                  </button>
                  {isOpen && (
                    <div className="pb-3">
                      <ol className="list-decimal pl-5 space-y-1 text-sm text-neutral-700 dark:text-neutral-200">
                        {a.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      {a.href && (
                        <Link href={a.href} className="inline-block mt-2 text-sm text-brand-600 hover:underline font-medium">
                          {a.linkLabel ?? "Open"} &rarr;
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
