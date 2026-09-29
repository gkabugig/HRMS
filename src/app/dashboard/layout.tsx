import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TABS_BY_ROLE, type UserRole } from "@/lib/auth/roles";
import SignOutButton from "./sign-out-button";

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
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold mb-2">Account not yet set up</h1>
          <p className="text-sm text-neutral-600 mb-4">
            You&apos;re signed in, but no HR role has been assigned to this account yet.
            Ask an admin to invite you from the Employees screen.
          </p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  const role = appUser.role as UserRole;
  const tabs = TABS_BY_ROLE[role];

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-neutral-900">HRMS</span>
            <span className="text-xs uppercase tracking-wide bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded">
              {role}
            </span>
          </div>
          <SignOutButton />
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="px-3 py-2 text-sm text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-t whitespace-nowrap"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
