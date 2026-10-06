// Help Centre for admin, HR and managers. Employees have their own Help page
// under My Space, so they are sent there.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { articlesForRole } from "@/lib/help/articles";
import type { UserRole } from "@/lib/auth/roles";
import HelpClient from "./help-client";

export default async function HelpCentrePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).maybeSingle();
  const role = appUser?.role as UserRole | undefined;
  if (!role) redirect("/login");
  if (role === "employee") redirect("/dashboard/me/help");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Help Centre</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Step-by-step guides for the things {role === "manager" ? "managers" : "HR and admins"} do most. Search, or open a topic.
        </p>
      </div>
      <HelpClient articles={articlesForRole(role)} />
    </div>
  );
}
