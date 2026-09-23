import { useState } from "react";
import { institutionStyle } from "@/lib/institutions";
import { cn } from "@/lib/utils";

/** Logo oficial da instituição (quando há) sobre fundo branco; senão, cor e iniciais. */
export function InstitutionBadge({ name, className }: { name: string; className?: string }) {
  const s = institutionStyle(name);
  const [failed, setFailed] = useState(false);

  if (s.logo && !failed) {
    return (
      <span
        aria-hidden
        className={cn("h-9 w-9 shrink-0 rounded-xl bg-white ring-1 ring-black/10 flex items-center justify-center overflow-hidden", className)}
      >
        <img src={s.logo} alt="" className="h-full w-full object-contain p-0.5" loading="lazy" onError={() => setFailed(true)} />
      </span>
    );
  }

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
