"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Clock,
  CalendarDays,
  Wallet,
  Target,
  GraduationCap,
  ShieldCheck,
  Gavel,
  LogOut,
  Settings,
  BarChart3,
  Network,
  Folder,
  Building2,
  CalendarClock,
  ClipboardList,
  History,
  Menu,
  X,
  Bell,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon, NavTab, NavGroup, UserRole } from "@/lib/auth/roles";
import SignOutButton from "./sign-out-button";
import CommandSearch from "@/components/search/command-search";
import NotificationBell from "@/components/notifications/notification-bell";

const ICONS: Record<NavIcon, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  users: Users,
  briefcase: Briefcase,
  clock: Clock,
  "calendar-days": CalendarDays,
  wallet: Wallet,
  target: Target,
  "graduation-cap": GraduationCap,
  "shield-check": ShieldCheck,
  gavel: Gavel,
  "log-out": LogOut,
  settings: Settings,
  "bar-chart": BarChart3,
  sitemap: Network,
  folder: Folder,
  building: Building2,
  "calendar-clock": CalendarClock,
  "clipboard-list": ClipboardList,
  history: History,
  bell: Bell,
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  hr: "HR",
  manager: "Manager",
  employee: "Employee",
};

const GROUP_ORDER: NavGroup[] = ["Overview", "People", "Workforce", "Payroll & Compliance", "Insights", "Admin"];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupTabs(tabs: NavTab[]): { group: NavGroup; tabs: NavTab[] }[] {
  return GROUP_ORDER.map((group) => ({ group, tabs: tabs.filter((t) => t.group === group) })).filter(
    (g) => g.tabs.length > 0
  );
}

export default function Sidebar({
  tabs,
  role,
  displayName,
  leavePendingCount = 0,
  unreadNotificationCount = 0,
}: {
  tabs: NavTab[];
  role: UserRole;
  displayName: string;
  leavePendingCount?: number;
  unreadNotificationCount?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const grouped = groupTabs(tabs);

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto thin-scrollbar px-3 py-4 space-y-4">
      {grouped.map(({ group, tabs: groupTabsList }) => (
        <div key={group}>
          {group !== "Overview" && (
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sidebar-text)]/70">
              {group}
            </p>
          )}
          <div className="space-y-0.5">
            {groupTabsList.map((t) => {
              const Icon = ICONS[t.icon];
              const active = isActive(pathname, t.href);
              const badge =
                t.key === "leave" && leavePendingCount > 0
                  ? leavePendingCount
                  : t.key === "notifications" && unreadNotificationCount > 0
                    ? unreadNotificationCount
                    : 0;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  onClick={onNavigate}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white/10 text-white"
                      : "text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r bg-accent-400" />
                  )}
                  <Icon size={18} strokeWidth={2} className={active ? "text-accent-400" : "text-[var(--sidebar-text)] group-hover:text-white"} />
                  <span className="truncate flex-1">{t.label}</span>
                  {badge > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-500 text-[10px] font-semibold text-white flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-[var(--sidebar-bg)] px-4 py-3 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-xs font-bold">
            H
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">HRMS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="[&_button]:border-[var(--sidebar-border)] [&_button]:text-[var(--sidebar-text)] [&_button:hover]:border-white/30">
            <CommandSearch role={role} />
          </div>
          <div className="[&_button]:border-[var(--sidebar-border)] [&_button]:text-[var(--sidebar-text)] [&_button:hover]:border-white/30">
            <NotificationBell />
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="text-[var(--sidebar-text)] hover:text-white p-1"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 bg-[var(--sidebar-bg)] h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--sidebar-border)]">
              <span className="text-white font-semibold text-sm tracking-tight">HRMS</span>
              <button onClick={() => setMobileOpen(false)} className="text-[var(--sidebar-text)] hover:text-white">
                <X size={20} />
              </button>
            </div>
            {navLinks(() => setMobileOpen(false))}
            <SidebarFooter role={role} displayName={displayName} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:fixed lg:inset-y-0 lg:left-0 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-brand-600/30">
            H
          </div>
          <div className="leading-tight">
            <p className="text-white font-semibold text-sm tracking-tight">HRMS</p>
            <p className="text-[10px] text-[var(--sidebar-text)] uppercase tracking-wider">SKMG Consulting</p>
          </div>
        </div>
        {navLinks()}
        <SidebarFooter role={role} displayName={displayName} />
      </aside>
    </>
  );
}

function SidebarFooter({ role, displayName }: { role: UserRole; displayName: string }) {
  return (
    <div className="border-t border-[var(--sidebar-border)] px-3 py-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-[var(--sidebar-bg-elevated)]">
        <div className="h-8 w-8 shrink-0 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-semibold">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{displayName}</p>
          <p className="text-[10px] uppercase tracking-wide text-accent-400">{ROLE_LABEL[role]}</p>
        </div>
      </div>
      <div className="mt-2 px-1">
        <SignOutButton />
      </div>
    </div>
  );
}
