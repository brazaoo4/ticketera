"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

export type PantryTheme = "light" | "dark";

const THEME_STORAGE_KEY = "ticketera-theme";
const THEME_EVENT = "ticketera-theme-change";

interface ThemeContextValue {
  theme: PantryTheme;
  setTheme: (next: PantryTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
});

function readThemeFromDom(): PantryTheme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Storage access blocked
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyThemeToDom(next: PantryTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", next);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", next);
  }
}

function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onCustom = () => callback();
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      const next =
        e.newValue === "dark" || e.newValue === "light"
          ? e.newValue
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      applyThemeToDom(next);
      callback();
    }
  };

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") return;
    } catch {
      // Ignore
    }
    applyThemeToDom(mq.matches ? "dark" : "light");
    callback();
  };

  window.addEventListener(THEME_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  mq.addEventListener("change", onMedia);

  return () => {
    window.removeEventListener(THEME_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
    mq.removeEventListener("change", onMedia);
  };
}

function setPersistedTheme(next: PantryTheme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignore storage restriction
  }
  applyThemeToDom(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THEME_EVENT));
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readThemeFromDom,
    () => "light" as PantryTheme
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setPersistedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Tactile segmented Light / Dark theme toggle matching the Sunny/Evening Pantry header.
 */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`inline-flex items-center p-[3px] rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] gap-0.5 shrink-0 ${className}`}
      role="group"
      aria-label="Color theme"
    >
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="Switch to light mode"
        aria-pressed={theme === "light"}
        title="Sunny Pantry (Light)"
        className={`w-8 h-7 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
          theme === "light"
            ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="Switch to dark mode"
        aria-pressed={theme === "dark"}
        title="Evening Pantry (Dark)"
        className={`w-8 h-7 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
          theme === "dark"
            ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        }`}
      >
        <Moon className="w-4 h-4" />
      </button>
    </div>
  );
}
