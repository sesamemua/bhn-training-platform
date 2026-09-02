"use client";

import { AV_DOCS, clipsFor, AV_CLIP_URL, type AvDoc } from "@/lib/symposium/av";
import { cn } from "@/lib/utils";

const ORDER: AvDoc["key"][] = ["q2025", "i2025", "q2026"];

/**
 * The three documents' own words about one line item, side by side.
 *
 * Not a re-typing of them — the actual rows, cropped out of the PDFs at
 * the coordinates where that item appears. That matters more than it
 * sounds: the 2026 quote strikes through prices it is not charging, and
 * a strikethrough is a drawn rule that no text extraction reports. The
 * transcribed table can tell you the projectors cost $1,300; only the
 * picture shows you the $1,950 crossed out above it.
 *
 * Three panes, stacked, because these are wide table rows — side by side
 * each would be a third of its natural width and unreadable. Stacked
 * they stay full width and read top to bottom in the order the argument
 * runs: quoted, billed, quoted again.
 */
export function AvSourcePanes({ lineKey, label }: { lineKey: string; label: string }) {
  const clips = clipsFor(lineKey);
  const present = ORDER.filter((k) => clips[k]);

  return (
    <div className="w-[min(46rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
      <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-[12px] font-bold text-fg">{label}</p>
        <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">
          as printed
        </p>
      </div>

      <div className="max-h-[26rem] divide-y divide-line overflow-y-auto">
        {ORDER.map((k) => {
          const clip = clips[k];
          const doc = AV_DOCS[k];
          return (
            <div key={k} className="px-3 py-2">
              <p className="flex items-baseline gap-2 text-[10px] uppercase tracking-wider font-bold">
                <span className={cn(k === "q2026" ? "text-accent" : "text-subtle")}>
                  {k === "q2025" ? "2025 quote" : k === "i2025" ? "2025 actual" : "2026 quote"}
                </span>
                <span className="normal-case tracking-normal font-normal text-subtle">
                  {doc.ref}{clip ? ` · p${clip.page}` : ""}
                </span>
              </p>
              {clip ? (
                <div className="mt-1 overflow-hidden rounded-md bg-white ring-1 ring-inset ring-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${AV_CLIP_URL}${clip.file}`}
                    alt={`${label} as it appears on ${doc.ref}`}
                    width={clip.w}
                    height={clip.h}
                    className="w-full"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <p className="mt-1 rounded-md bg-elevated px-2.5 py-2 text-[11px] italic text-subtle">
                  Does not appear on this document.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {present.length < ORDER.length && (
        <p className="border-t border-line px-3 py-1.5 text-[10.5px] text-subtle">
          On {present.length} of the three documents.
        </p>
      )}
    </div>
  );
}
