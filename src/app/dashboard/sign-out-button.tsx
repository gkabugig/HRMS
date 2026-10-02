"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton({ variant = "sidebar" }: { variant?: "sidebar" | "light" }) {
  const router = useRouter();
  const supabase = createClient();

  const className =
    variant === "sidebar"
      ? "w-full flex items-center gap-2 text-xs font-medium text-[var(--sidebar-text)] hover:text-white px-1.5 py-1.5 rounded-md hover:bg-white/5 transition-colors"
      : "inline-flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-neutral-400 hover:text-slate-900 hover:dark:text-neutral-50 transition-colors";

  return (
    <button
      className={className}
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut size={14} />
      Sign out
    </button>
  );
}
