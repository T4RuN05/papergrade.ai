"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "papergrade_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Apply theme to DOM and PWA meta tags
  const applyTheme = useCallback((targetTheme: ResolvedTheme) => {
    const root = document.documentElement;
    if (targetTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Synchronize PWA browser chrome bar
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement("meta");
      metaThemeColor.setAttribute("name", "theme-color");
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute("content", targetTheme === "dark" ? "#191919" : "#f6f5f4");
  }, []);

  // Compute resolved theme from setting and system preference
  const resolveActualTheme = useCallback((pref: Theme): ResolvedTheme => {
    if (pref === "light") return "light";
    if (pref === "dark") return "dark";
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }, []);

  // Initial mount: retrieve stored choice or fallback to system
  useEffect(() => {
    setMounted(true);
    let initialPref: Theme = "system";
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark" || stored === "system") {
        initialPref = stored;
      }
    } catch {
      // localStorage may fail in restricted iframes / privacy modes
    }

    setThemeState(initialPref);
    const resolved = resolveActualTheme(initialPref);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [resolveActualTheme, applyTheme]);

  // Listen for operating system theme changes when in 'system' mode
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        const nextResolved = e.matches ? "dark" : "light";
        setResolvedTheme(nextResolved);
        applyTheme(nextResolved);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      // Legacy browsers fallback
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch {
        // Safe fallback
      }
      const resolved = resolveActualTheme(newTheme);
      setResolvedTheme(resolved);
      applyTheme(resolved);
    },
    [resolveActualTheme, applyTheme]
  );

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: mounted ? resolvedTheme : "light",
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Sleek Notion-style Theme Toggle Button
 */
export function ThemeToggle({
  className = "",
  showLabel = false,
  size = "md",
}: {
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  const sizeClasses =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : "h-8 w-8 text-sm";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-canvas-soft border border-hairline transition-all cursor-pointer ${
        showLabel ? "px-2.5 py-1.5 w-auto gap-2" : sizeClasses
      } ${className}`}
      title={
        isDark
          ? "Switch to Light Mode (Warm Paper)"
          : "Switch to Dark Mode (Obsidian Paper)"
      }
      aria-label="Toggle visual theme"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0 scale-100" />
      ) : (
        <Moon className="h-4 w-4 text-ink-secondary transition-transform duration-200 rotate-0 scale-100" />
      )}
      {showLabel && (
        <span className="text-xs font-medium text-ink truncate">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}

