import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/** Alterna entre tema claro e escuro. `withLabel` mostra o texto ao lado do ícone (menu lateral). */
export function ThemeToggle({ withLabel, className }: { withLabel?: boolean; className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Tema claro" : "Tema escuro";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-sm transition-colors",
        withLabel
          ? "px-3 py-2 w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          : "h-9 w-9 justify-center border border-border bg-card text-muted-foreground hover:text-foreground shadow-card",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {withLabel && label}
    </button>
  );
}
