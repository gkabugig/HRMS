"use client";

// Global command palette (spec §13). ⌘K/Ctrl+K opens it, employee results
// come from the permission-filtered searchCommand server action, and the
// static "actions" list is filtered to what this app actually has a route
// for and what the signed-in role may do.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserPlus, Wallet, CalendarCheck, Briefcase, FileText } from "lucide-react";
import { searchCommand } from "../actions";
import type { UserRole } from "@/lib/auth/roles";

type StaticAction = { label: string; href: string; icon: typeof Search; roles: UserRole[] };

const STATIC_ACTIONS: StaticAction[] = [
  { label: "Add employee", href: "/dashboard/employees", icon: UserPlus, roles: ["admin", "hr"] },
  { label: "Run payroll", href: "/dashboard/payroll", icon: Wallet, roles: ["admin", "hr"] },
  { label: "Approve leave", href: "/dashboard/leave", icon: CalendarCheck, roles: ["admin", "hr", "manager"] },
  { label: "Create vacancy", href: "/dashboard/recruitment", icon: Briefcase, roles: ["admin", "hr"] },
  { label: "Generate report", href: "/dashboard/reports", icon: FileText, roles: ["admin", "hr"] },
];

const NAV_SHORTCUTS: { label: string; href: string }[] = [
  { label: "Employees", href: "/dashboard/employees" },
  { label: "Payroll", href: "/dashboard/payroll" },
  { label: "Leave requests", href: "/dashboard/leave" },
  { label: "Attendance exceptions", href: "/dashboard/attendance" },
  { label: "Reports", href: "/dashboard/reports" },
];

export default function CommandSearch({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name: string; staff_no: string; department: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setEmployees([]);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setEmployees([]);
      return;
    }
    searchCommand(q).then((res) => setEmployees(res.employees));
  }, []);

  function go(href: string) {
    close();
    router.push(href);
  }

  const filteredActions = STATIC_ACTIONS.filter((a) => a.roles.includes(role));
  const filteredNav = NAV_SHORTCUTS.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 text-sm text-neutral-400 bg-neutral-50 border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 w-64 hover:border-neutral-300 transition-colors"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search employees, payroll, reports…</span>
        <kbd className="text-[10px] bg-white border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-400">⌘K</kbd>
      </button>
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] text-neutral-500"
        aria-label="Search"
      >
        <Search size={16} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-neutral-900/30" onClick={close}>
          <div
            className="w-full max-w-lg bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
              <Search size={16} className="text-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search employees, payroll, reports..."
                className="flex-1 text-sm outline-none bg-transparent text-neutral-900 placeholder:text-neutral-400"
              />
              <kbd className="text-[10px] bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-400">Esc</kbd>
            </div>
            <div className="max-h-96 overflow-y-auto py-2">
              {employees.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Employees</div>
                  {employees.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => go(`/dashboard/employees/${e.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left"
                    >
                      <span className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {e.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-neutral-900 truncate">{e.name}</span>
                        <span className="block text-xs text-neutral-400 truncate">
                          {e.staff_no} · {e.department}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {filteredNav.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Go to</div>
                  {filteredNav.map((n) => (
                    <button
                      key={n.href}
                      onClick={() => go(n.href)}
                      className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
              )}

              {query.trim().length === 0 && (
                <div>
                  <div className="px-4 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Actions</div>
                  {filteredActions.map((a) => (
                    <button
                      key={a.href}
                      onClick={() => go(a.href)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 text-left"
                    >
                      <a.icon size={14} className="text-neutral-400" />
                      {a.label}
                    </button>
                  ))}
                </div>
              )}

              {query.trim().length >= 2 && employees.length === 0 && filteredNav.length === 0 && (
                <p className="px-4 py-6 text-sm text-neutral-400 text-center">No results.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
