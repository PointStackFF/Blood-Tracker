"use client";

import { useCallback, useEffect, useState } from "react";

// Persisted per phone, like the base. "auto" follows the OS setting.
export type Theme = "auto" | "light" | "dark";
export const THEME_STORAGE_KEY = "blood-tracker-theme";

// Runs inline in <head> before hydration so the first paint is already the
// right colour — no white flash on a dark phone in a dark hangar.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

const ORDER: Theme[] = ["auto", "light", "dark"];
const LABEL: Record<Theme, string> = { auto: "Auto", light: "Light", dark: "Dark" };

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the persisted choice once on mount
    setTheme(readTheme());
  }, []);

  // In auto, track OS changes live.
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const cycle = useCallback(() => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "auto") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) — the choice just won't persist.
    }
  }, [theme]);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[theme]}. Tap to change.`}
      className={`text-[13px] font-medium text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 ${className}`}
    >
      {LABEL[theme]} theme
    </button>
  );
}
