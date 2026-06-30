import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = "" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`group relative flex size-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white/70 text-slate-600 transition hover:border-blue-400 hover:text-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-cyan-400/60 dark:hover:text-cyan-300 ${className}`}
    >
      <Sun
        size={18}
        className={`absolute transition-all duration-300 ${
          isDark
            ? "scale-0 -rotate-90 opacity-0"
            : "scale-100 rotate-0 opacity-100"
        }`}
        aria-hidden="true"
      />
      <Moon
        size={18}
        className={`absolute transition-all duration-300 ${
          isDark
            ? "scale-100 rotate-0 opacity-100"
            : "scale-0 rotate-90 opacity-0"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}
