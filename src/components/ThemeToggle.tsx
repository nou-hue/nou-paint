import { Moon, Sun } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Follows the system setting until you tap it; then your choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => {
        haptic("select");
        toggle();
      }}
      className={cn("press glass relative grid size-11 place-items-center rounded-full text-ink", className)}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      data-testid="theme-toggle"
    >
      <Sun
        className={cn("theme-icon absolute size-5", dark ? "theme-icon-out" : "theme-icon-in")}
        aria-hidden
      />
      <Moon
        className={cn("theme-icon absolute size-5", dark ? "theme-icon-in" : "theme-icon-out")}
        aria-hidden
      />
    </button>
  );
}
