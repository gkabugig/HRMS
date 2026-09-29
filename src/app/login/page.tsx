"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
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
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">HRMS</h1>
        <p className="text-sm text-neutral-500 mb-6">
          {mode === "signin" ? "Sign in to continue" : "Create the first admin account"}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm text-neutral-700 mb-1">Full name</label>
              <input
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-neutral-700 mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-700 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="mt-4 text-sm text-neutral-500 underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "First time here? Set up admin account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
