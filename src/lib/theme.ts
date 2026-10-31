import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "nou-theme";
export type Theme = "light" | "dark";

/** Colours for the browser chrome (address bar). Must match --color-bg in styles.css. */
export const THEME_COLOR: Record<Theme, string> = { light: "#f6f1e6", dark: "#14110d" };

/**
 * Runs in <head> before first paint so there is no flash of the wrong theme.
 * Only an explicit choice is stored; with nothing stored we follow the OS (CSS does that).
 * It stores a display preference on this device only; nothing is sent anywhere.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute("content",t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}");m[i].removeAttribute("media")}}}catch(e){}})();`;

export function resolveTheme(stored: string | null | undefined, systemDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

function readTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    /* storage blocked: follow the system */
  }
  const dark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveTheme(stored, dark);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setTheme(readTheme());
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", THEME_COLOR[next]);
      m.removeAttribute("media");
    });
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, [theme]);

  return { theme, toggle };
}
