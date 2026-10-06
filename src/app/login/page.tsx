import { createAdminClient } from "@/lib/supabase/admin";
import LoginForm from "./login-form";

// The one-time "set up the first admin" option only makes sense while the
// organisation has no users at all. The check runs on the server with the
// service role (the visitor isn't signed in, so row-level security would hide
// every row). If it can't be determined we hide the option - the safe default.
async function isFirstTimeSetup(): Promise<boolean> {
  try {
    const { count, error } = await createAdminClient().from("app_users").select("id", { count: "exact", head: true });
    return !error && count === 0;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return <LoginForm canSetup={await isFirstTimeSetup()} />;
}
