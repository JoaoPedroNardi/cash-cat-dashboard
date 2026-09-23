import { institutionStyle } from "@/lib/institutions";
import { cn } from "@/lib/utils";

/** Quadrado arredondado com a cor e as iniciais da instituição. */
export function InstitutionBadge({ name, className }: { name: string; className?: string }) {
  const s = institutionStyle(name);
  return (
    <span
      aria-hidden
      className={cn("h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-[11px] font-bold", className)}
      style={{ background: s.background, color: s.color }}
    >
      {s.initials}
    </span>
  );
}
