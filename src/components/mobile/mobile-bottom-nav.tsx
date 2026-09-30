"use client";

// Role-aware bottom navigation (spec Part V §23). Kept to 5 items max, and
// deliberately different per role rather than a generic subset of the
// desktop sidebar — spec §26: "Managers need action-oriented mobile views,
// not the full HR administrator interface."
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clock, CalendarDays, Wallet, Search, Bell, User, Users, CheckSquare } from "lucide-react";
import type { UserRole } from "@/lib/auth/roles";
import type { LucideIcon } from "lucide-react";

// Trigger for the global CommandSearch palette (see components/search/
// command-search.tsx, which listens for this on window) — the bottom nav
// is a row of plain links, and opening a modal from one of them without
// prop-drilling through the layout is simplest as a DOM event.
export const OPEN_SEARCH_EVENT = "hrms:open-search";

type BottomItem = { key: string; label: string; href: string; icon: LucideIcon; action?: "open-search" };

// Matches spec §23/§26 literally: employee gets
// Home → Attendance → Leave → Payslips → Notifications; manager gets
// Home → Team → Approvals → Search → Profile. HR/admin aren't spelled out
// there (that audience mostly works from desktop) — given the same
// treatment as the employee row plus Notifications, since they still need
// a usable phone view.
const ITEMS_BY_ROLE: Record<UserRole, BottomItem[]> = {
  employee: [
    { key: "home", label: "Home", href: "/dashboard", icon: Home },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: Clock },
    { key: "leave", label: "Leave", href: "/dashboard/leave", icon: CalendarDays },
    { key: "payslips", label: "Payslips", href: "/dashboard/payroll", icon: Wallet },
    { key: "notifications", label: "Alerts", href: "/dashboard/notifications", icon: Bell },
  ],
  manager: [
    { key: "home", label: "Home", href: "/dashboard", icon: Home },
    { key: "team", label: "Team", href: "/dashboard/attendance#team", icon: Users },
    { key: "approvals", label: "Approvals", href: "/dashboard/leave?view=requests", icon: CheckSquare },
    { key: "search", label: "Search", href: "#", icon: Search, action: "open-search" },
    { key: "profile", label: "Profile", href: "/dashboard/employees/me", icon: User },
  ],
  hr: [
    { key: "home", label: "Home", href: "/dashboard", icon: Home },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: Clock },
    { key: "leave", label: "Leave", href: "/dashboard/leave?view=requests", icon: CalendarDays },
    { key: "search", label: "Search", href: "#", icon: Search, action: "open-search" },
    { key: "notifications", label: "Alerts", href: "/dashboard/notifications", icon: Bell },
  ],
  admin: [
    { key: "home", label: "Home", href: "/dashboard", icon: Home },
    { key: "attendance", label: "Attendance", href: "/dashboard/attendance", icon: Clock },
    { key: "leave", label: "Leave", href: "/dashboard/leave?view=requests", icon: CalendarDays },
    { key: "search", label: "Search", href: "#", icon: Search, action: "open-search" },
    { key: "notifications", label: "Alerts", href: "/dashboard/notifications", icon: Bell },
  ],
};

function isActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/dashboard" || base === "#") return pathname === "/dashboard" && base !== "#";
  return pathname === base || pathname.startsWith(base + "/");
}

export default function MobileBottomNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = ITEMS_BY_ROLE[role];

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--surface)] border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          if (item.action === "open-search") {
            return (
              <button
                key={item.key}
                onClick={() => window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT))}
                className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-neutral-400 transition-colors"
              >
                <Icon size={18} strokeWidth={2} />
                {item.label}
              </button>
            );
          }
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-brand-600" : "text-neutral-400"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
