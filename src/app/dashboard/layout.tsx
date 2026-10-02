import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tabsForRole, DEFAULT_VISIBLE_MODULES, type UserRole } from "@/lib/auth/roles";
import SignOutButton from "./sign-out-button";
import Sidebar from "./sidebar";
import CommandSearch from "@/components/search/command-search";
import NotificationBell from "@/components/notifications/notification-bell";
import MobileBottomNav from "@/components/mobile/mobile-bottom-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("id, org_id, role, employee_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-muted)] px-4">
        <div className="max-w-sm text-center bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-8">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-50 mb-2">Account not yet set up</h1>
          <p className="text-sm text-slate-500 dark:text-neutral-400 mb-5">
            You&apos;re signed in, but no HR role has been assigned to this account yet.
            Ask an admin to invite you from the Employees screen.
          </p>
          <SignOutButton variant="light" />
        </div>
      </div>
    );
  }

  const role = appUser.role as UserRole;

  const [{ data: permRows }, { count: pendingLeaveCount }, { count: unreadNotificationCount }] = await Promise.all([
    supabase
      .from("role_module_permissions")
      .select("module_key, can_view")
      .eq("org_id", appUser.org_id)
      .eq("role", role),
    // RLS already scopes this to "my team" for a manager and "my own" for an
    // employee, so the same query gives each role the right number.
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "Pending"),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false),
  ]);

  const visible =
    permRows && permRows.length > 0
      ? new Set(permRows.filter((r) => r.can_view).map((r) => r.module_key))
      : new Set(DEFAULT_VISIBLE_MODULES[role]);

  const tabs = tabsForRole(role, visible);
  const displayName = user.email?.split("@")[0] ?? "User";

  return (
    <div className="min-h-screen bg-[var(--surface-muted)]">
      <Sidebar
        tabs={tabs}
        role={role}
        displayName={displayName}
        leavePendingCount={pendingLeaveCount ?? 0}
        unreadNotificationCount={unreadNotificationCount ?? 0}
      />
      <main className="lg:pl-64 pb-16 lg:pb-0">
        <div className="hidden lg:flex items-center justify-end gap-3 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <CommandSearch role={role} />
          <NotificationBell />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
      <MobileBottomNav role={role} />
    </div>
  );
}
