// The organisation the signed-in user belongs to. Server actions use this
// instead of a hard-coded organisation id, so every row is written into the
// caller's own organisation (and a second organisation just works).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireOrgId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: appUser } = await supabase.from("app_users").select("org_id").eq("id", user.id).maybeSingle();
  if (!appUser?.org_id) throw new Error("Your account isn't set up for an organisation yet.");
  return appUser.org_id as string;
}
