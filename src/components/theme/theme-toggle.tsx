"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "hrms-theme";

// The theme lives as a class on <html> (set by theme-script.tsx before
// paint, and toggled below), not in React state - useSyncExternalStore
// reads that external DOM state directly rather than mirroring it into a
// useEffect + setState pair, which read correctly, it caused a cascading
// re-render on mount.
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  // No class exists yet during SSR; theme-script.tsx sets the real one
  // client-side before paint, and the MutationObserver picks that up.
  return false;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !isDark;
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(next ? "dark" : "light");
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // best-effort; theme just won't persist across visits
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white transition-colors w-full ${className}`}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
