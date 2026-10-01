// Server-only Supabase client using the service_role key. This is the only
// client in the codebase with elevated privileges (bypasses RLS entirely).
// Two legitimate uses: calling the Auth Admin API for provisioning logins,
// and the scheduled /api/cron/approval-escalations route, which runs with
// no user session at all (no auth.uid(), no "current org") and is
// inherently cross-org — there's no RLS-scoped session to run it as. Every
// other query against application data goes through the normal RLS-scoped
// client in lib/supabase/server.ts; a new use of this client should be held
// to the same bar as those two (no session to scope by, not just
// "convenient").
//
// Requires SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard -> Settings -> API
// -> service_role secret) as a server-only env var — never NEXT_PUBLIC_,
// since that prefix ships to the browser bundle. Set it in .env.local for
// local dev and in Vercel's Environment Variables for production.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it in Vercel (Settings -> Environment Variables) and .env.local " +
        "— find the value in the Supabase dashboard under Settings -> API -> service_role secret."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
