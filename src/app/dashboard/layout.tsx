import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TABS_BY_ROLE, type UserRole } from "@/lib/auth/roles";
import SignOutButton from "./sign-out-button";
import Sidebar from "./sidebar";

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
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Account not yet set up</h1>
          <p className="text-sm text-slate-500 mb-5">
            You&apos;re signed in, but no HR role has been assigned to this account yet.
            Ask an admin to invite you from the Employees screen.
          </p>
          <SignOutButton variant="light" />
        </div>
      </div>
    );
  }

  const role = appUser.role as UserRole;
  const tabs = TABS_BY_ROLE[role];
  const displayName = user.email?.split("@")[0] ?? "User";

  return (
    <div className="min-h-screen bg-[var(--surface-muted)]">
      <Sidebar tabs={tabs} role={role} displayName={displayName} />
      <main className="lg:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
