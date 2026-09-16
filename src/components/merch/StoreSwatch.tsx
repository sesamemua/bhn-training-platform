/**
 * A tee-colour dot. Fixed colours, not theme tokens: it stands for the
 * fabric, and a black tee is black whichever theme is reading about it.
 * The rings are mid-greys so each dot keeps a 3:1 edge on light and dark
 * cards alike — white on an off-white card is otherwise nearly invisible.
 */
import { cn } from "@/lib/utils";
import type { TeeColour } from "@/lib/merch/store";

export function Swatch({ colour, checked, className }: { colour: TeeColour; checked?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-transform",
        colour === "white" ? "bg-white ring-slate-500" : "bg-neutral-950 ring-neutral-500",
        checked && "motion-safe:scale-110",
        className,
      )}
    >
      {checked && (
        <span className={cn("h-2 w-2 rounded-full", colour === "white" ? "bg-neutral-900" : "bg-white")} />
      )}
    </span>
  );
}
