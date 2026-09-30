import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// "Profile" bottom-nav destination — resolves the signed-in user's own
// employee record and forwards to their Employee 360 page rather than
// duplicating that page's content here.
export default async function MyProfileRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", user!.id)
    .maybeSingle();

  if (appUser?.employee_id) {
    redirect(`/dashboard/employees/${appUser.employee_id}?tab=bio`);
  }
  redirect("/dashboard");
}
