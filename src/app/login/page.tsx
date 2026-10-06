"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveLoginIdentifier } from "@/lib/auth/username";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        // Accepts a username or an email: a username is mapped to its
        // internal account email (see lib/auth/username.ts).
        const { error } = await supabase.auth.signInWithPassword({ email: resolveLoginIdentifier(email).email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // First user in the org becomes admin via the bootstrap RPC.
        // If app_users already has rows for this org, this call fails harmlessly
        // and an admin needs to invite this person instead.
        if (data.user) {
          await supabase.rpc("bootstrap_admin", {
            p_org_id: DEFAULT_ORG_ID,
            p_full_name: fullName || null,
          });
        }
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1424] px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent-500/20 blur-3xl" />
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xl shadow-black/20 p-8 relative">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-white text-base font-bold shadow-lg shadow-brand-600/30 mb-4">
          H
        </div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50 mb-1">HRMS</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
          {mode === "signin" ? "Sign in to continue" : "Create the first admin account"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">Full name</label>
              <input
                className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 text-sm"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">
              {mode === "signin" ? "Username or email" : "Email"}
            </label>
            <input
              type={mode === "signin" ? "text" : "email"}
              autoCapitalize="none"
              autoComplete="username"
              required
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-700 dark:text-neutral-200 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "First time here? Set up admin account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
