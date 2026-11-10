"use client";

import { AtSign } from "lucide-react";
import { hasMention, tagLabel, TAGGABLE, toggleMention } from "@/lib/social/tags";
import { cn } from "@/lib/utils";

/** Tag people and partners: each chip adds or removes its @mention in the post's closing line. */
export function SocialTagPicker({ body, onChange, disabled = false }: { body: string; onChange: (body: string) => void; disabled?: boolean }) {
  const allOn = TAGGABLE.every((m) => hasMention(body, m));
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tag people">
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted"><AtSign size={12} aria-hidden /> Tag</span>
      {TAGGABLE.map((m) => {
        const on = hasMention(body, m);
        return (
          <button key={m} type="button" aria-pressed={on} title={m} disabled={disabled} onClick={() => onChange(toggleMention(body, m))}
            className={cn("rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-40",
              on ? "border-brand-500 bg-brand-50 font-semibold text-brand-800" : "border-line text-fg hover:border-brand-400")}>
            {tagLabel(m)}
          </button>
        );
      })}
      <button type="button" disabled={disabled} onClick={() => onChange(TAGGABLE.reduce((b, m) => (hasMention(b, m) === allOn ? toggleMention(b, m) : b), body))}
        className="text-[12px] font-semibold text-brand-700 disabled:opacity-40">{allOn ? "Untag all" : "Tag all"}</button>
    </div>
  );
}
