"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  CheckCircle2,
  LifeBuoy,
  LineChart,
  ShieldAlert,
  Sparkles,
  User,
  CheckSquare,
  HelpCircle,
  Bot,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon, NavTab, NavGroup, UserRole } from "@/lib/auth/roles";
import SignOutButton from "./sign-out-button";
import CommandSearch from "@/components/search/command-search";
import NotificationBell from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";

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
  "check-circle": CheckCircle2,
  "life-buoy": LifeBuoy,
  "line-chart": LineChart,
  "shield-alert": ShieldAlert,
  sparkles: Sparkles,
  user: User,
  "check-square": CheckSquare,
  "help-circle": HelpCircle,
  bot: Bot,
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  hr: "HR",
  manager: "Manager",
  employee: "Employee",
};

const GROUP_ORDER: NavGroup[] = ["Overview", "My Space", "People", "Workforce", "Payroll & Compliance", "Insights", "Admin"];

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

  // Collapsible sections. The section holding the current page is always
  // open (so you can see where you are); the others open/close on click and
  // the choice is remembered per browser. Everything starts collapsed except
  // the active section, which keeps a long menu short at a glance.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hrms.sidebar.expanded");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved choice after mount (avoids SSR mismatch)
      if (saved) setExpanded(JSON.parse(saved));
    } catch {
      /* storage unavailable - just use defaults */
    }
  }, []);
  function toggleGroup(group: string) {
    setExpanded((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      try {
        window.localStorage.setItem("hrms.sidebar.expanded", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  const badgeFor = (key: string) =>
    key === "leave" && leavePendingCount > 0
      ? leavePendingCount
      : key === "notifications" && unreadNotificationCount > 0
        ? unreadNotificationCount
        : 0;

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto thin-scrollbar px-3 py-4 space-y-4">
      {grouped.map(({ group, tabs: groupTabsList }, index) => {
        const hasActive = groupTabsList.some((t) => isActive(pathname, t.href));
        const open = hasActive || !!expanded[group];
        const hiddenBadges = open ? 0 : groupTabsList.reduce((sum, t) => sum + badgeFor(t.key), 0);
        const panelId = `nav-group-${group.replace(/\W+/g, "-").toLowerCase()}`;
        return (
        <div key={group} className={index > 0 ? "pt-3 border-t border-[var(--sidebar-border)]" : ""}>
          <button
            type="button"
            onClick={() => toggleGroup(group)}
            aria-expanded={open}
            aria-controls={panelId}
            className="w-full px-3 py-1.5 mb-1 flex items-center gap-2 rounded-md text-[11px] font-bold uppercase tracking-[0.12em] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden />
            <span className="flex-1 text-left">{group}</span>
            {hiddenBadges > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent-500 text-[10px] font-semibold text-white flex items-center justify-center normal-case tracking-normal">
                {hiddenBadges}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
          </button>
          <div id={panelId} hidden={!open} className="space-y-0.5">
            {groupTabsList.map((t) => {
              const Icon = ICONS[t.icon];
              const active = isActive(pathname, t.href);
              const badge = badgeFor(t.key);
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
        );
      })}
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
      <div className="mt-2 px-1 space-y-0.5">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </div>
  );
}
