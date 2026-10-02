"use client";

// Global command palette (spec Part III — available everywhere, not just
// the dashboard home page, so it lives in the dashboard layout's top bar).
// ⌘K/Ctrl+K opens it; results are grouped by category and permission-
// filtered server-side by globalSearch(); recent searches persist in this
// browser only (no server round-trip needed for that).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Wallet, CalendarCheck, Clock, Briefcase, FileText, type LucideIcon } from "lucide-react";
import { globalSearch, getRecentActions } from "@/lib/search/global-search";
import type { GlobalSearchResponse } from "@/lib/search/search-types";
import type { UserRole } from "@/lib/auth/roles";
import { OPEN_SEARCH_EVENT } from "@/components/mobile/mobile-bottom-nav";

const ACTION_ICONS: Record<string, LucideIcon> = {
  "action-add-employee": UserPlus,
  "action-run-payroll": Wallet,
  "action-approve-leave": CalendarCheck,
  "action-request-leave": CalendarCheck,
  "action-clock-in": Clock,
  "action-create-vacancy": Briefcase,
  "action-generate-report": FileText,
};

const RECENT_KEY = "hrms_recent_searches";

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(entries: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, 5)));
  } catch {
    // Private browsing / storage disabled — recent searches just won't persist.
  }
}

export default function CommandSearch({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<GlobalSearchResponse>({ groups: [] });
  const [defaultActions, setDefaultActions] = useState<{ id: string; label: string; href: string }[]>([]);
  const [defaultNav, setDefaultNav] = useState<{ id: string; label: string; href: string }[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResponse({ groups: [] });
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 10);
    setRecent(loadRecent());
    getRecentActions(role).then((res) => {
      setDefaultActions(res.actions);
      setDefaultNav(res.nav);
    });
  }, [role]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open, openPalette]);

  useEffect(() => {
    window.addEventListener(OPEN_SEARCH_EVENT, openPalette);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openPalette);
  }, [openPalette]);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResponse({ groups: [] });
      return;
    }
    globalSearch(q).then(setResponse);
  }, []);

  function go(href: string, label?: string) {
    if (label && query.trim().length >= 2) {
      const next = [label, ...recent.filter((r) => r !== label)].slice(0, 5);
      saveRecent(next);
    }
    close();
    router.push(href);
  }

  return (
    <>
      <button
        onClick={() => openPalette()}
        className="hidden sm:flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500 bg-neutral-50 dark:bg-neutral-900 border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 w-64 hover:border-neutral-300 hover:dark:border-neutral-600 transition-colors"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd className="text-[10px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500">⌘K</kbd>
      </button>
      <button
        onClick={() => openPalette()}
        className="sm:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] text-neutral-500 dark:text-neutral-400"
        aria-label="Search"
      >
        <Search size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-neutral-900/30" onClick={close}>
          <div
            className="w-full max-w-lg bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
              <Search size={16} className="text-neutral-400 dark:text-neutral-500" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search employees, payroll, leave, documents…"
                aria-label="Search"
                className="flex-1 text-sm outline-none bg-transparent text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 placeholder:dark:text-neutral-500"
              />
              <kbd className="text-[10px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-0.5 text-neutral-400 dark:text-neutral-500">Esc</kbd>
            </div>
            <div className="max-h-96 overflow-y-auto py-2">
              {query.trim().length === 0 && (
                <>
                  {recent.length > 0 && (
                    <div className="mb-2">
                      <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">Recent</div>
                      {recent.map((r) => (
                        <button key={r} onClick={() => runSearch(r)} className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 hover:dark:bg-neutral-900">
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                  {defaultNav.length > 0 && (
                    <div className="mb-2">
                      <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">Go to</div>
                      {defaultNav.map((n) => (
                        <button key={n.id} onClick={() => go(n.href)} className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 hover:dark:bg-neutral-900">
                          {n.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">Actions</div>
                    {defaultActions.map((a) => {
                      const Icon = ACTION_ICONS[a.id] ?? Search;
                      return (
                        <button key={a.id} onClick={() => go(a.href)} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 hover:dark:bg-neutral-900 text-left">
                          <Icon size={14} className="text-neutral-400 dark:text-neutral-500" />
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {query.trim().length >= 2 &&
                response.groups.map((g) => (
                  <div key={g.category} className="mb-2">
                    <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">{g.label}</div>
                    {g.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => go(item.href, item.label)}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 hover:dark:bg-neutral-900 text-left"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-neutral-900 dark:text-neutral-50 truncate">{item.label}</span>
                          {item.sublabel && <span className="block text-xs text-neutral-400 dark:text-neutral-500 truncate">{item.sublabel}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}

              {query.trim().length >= 2 && response.groups.length === 0 && (
                <p className="px-4 py-6 text-sm text-neutral-400 dark:text-neutral-500 text-center">No results. Try a different term.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
