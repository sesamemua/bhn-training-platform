"use client";

/**
 * One vendor document, whole, with the line you were reading marked.
 *
 * The dock beside the table can only ever be about 340px wide, and at
 * that width a Letter page renders at 0.48× actual size — small enough
 * that you can see WHERE a number is but not read it. That is fine for
 * "which document says this" and useless for "check the number", which
 * is the question this page exists to answer.
 *
 * So the dock stays the index and this is the reading surface: every
 * page of the document, at a size you can actually read, with the item's
 * row outlined on the page it appears on and scrolled to. The three
 * documents are tabs rather than three separate openings, because the
 * whole argument of this screen is what the three say about the SAME
 * line — switching keeps your place on the item, not on the page number.
 *
 * The highlight geometry is NOT re-derived here. It comes from
 * <PageSheet>, the same component the dock draws, for the reason this
 * codebase keeps relearning: a second implementation of one rule is a
 * second implementation that will disagree.
 */
/* No `mounted` guard, and none needed: the parent renders this only
   once `viewing` is non-null, which only a click can do. There is no
   server render to portal against. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import {
  AV_DOCS, clipsFor, clipUrl, pagesOf, type AvDoc,
} from "@/lib/symposium/av";
import { cn } from "@/lib/utils";
import { IconBtn, PageSheet } from "./AvSourcePanes";

const ORDER: AvDoc["key"][] = ["q2025", "i2025", "q2026"];
const SHORT: Record<AvDoc["key"], string> = {
  q2025: "2025 quote", i2025: "2025 actual", q2026: "2026 quote",
};

export function AvDocumentViewer({
  lineKey, label, docKey, onClose,
}: {
  lineKey: string;
  label: string;
  /** Which document was clicked. Switchable once open. */
  docKey: AvDoc["key"];
  onClose: () => void;
}) {
  const [active, setActive] = useState<AvDoc["key"]>(docKey);
  const [zoom, setZoom] = useState(1);
  const clips = clipsFor(lineKey);
  const clip = clips[active];
  const doc = AV_DOCS[active];
  const pages = useMemo(() => pagesOf(active), [active]);

  /* Escape closes THIS, not the panel underneath.
     The dock registers its own window keydown listener for Escape. A
     window listener cannot be stopped by a later one, so both would fire
     and one keypress would close two things. Capture phase plus
     stopPropagation puts this one first and keeps the event to itself
     while the viewer is open. */
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  /* The page behind must not scroll while a full-screen sheet is open —
     the classic "I scrolled the wrong thing" bug. Restores whatever was
     there rather than assuming "" so a nested lock cannot clear it. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* One focusable control focused on open, and focus put back where it
     came from on close. Matches ConfirmDialog and MerchClaimDialog —
     this codebase has never trapped Tab and this is not the place to
     become the first thing that does. */
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const from = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => from?.focus?.();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-slate-950/80 backdrop-blur-sm animate-fade-in"
      // Backdrop click closes. Guarded on currentTarget so a click that
      // lands on the document itself — which is most of this surface —
      // does not dismiss the thing you are reading.
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} on ${doc.ref}`}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-3 sm:p-6">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card shadow-2xl">

          {/* ── Header: what you are looking at, then how to move around it */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                {clip ? `Marked on page ${clip.page} of ${pages.length}` : `${pages.length} pages`}
              </p>
              <p className="truncate text-[14px] font-bold text-fg">{label}</p>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              <IconBtn onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
                label="Zoom out" disabled={zoom <= 0.6}><ZoomOut size={14} /></IconBtn>
              <span className="w-10 text-center text-[10.5px] tabular-nums text-subtle">
                {Math.round(zoom * 100)}%
              </span>
              <IconBtn onClick={() => setZoom((z) => Math.min(2.6, +(z + 0.2).toFixed(1)))}
                label="Zoom in" disabled={zoom >= 2.6}><ZoomIn size={14} /></IconBtn>
              <a
                href={clipUrl(pages[0]?.render.file ?? "")}
                target="_blank"
                rel="noopener noreferrer"
                title="Open the page image in a new tab"
                className="rounded-md p-1.5 text-subtle transition-colors hover:bg-elevated hover:text-fg"
              >
                <ExternalLink size={14} aria-hidden />
                <span className="sr-only">Open the page image in a new tab</span>
              </a>
              <IconBtn onClick={close} label="Close" ref_={closeRef}><X size={16} /></IconBtn>
            </div>
          </div>

          {/* ── Which document. The line stays selected across all three,
                 which is the comparison this screen is for. A document
                 that never mentions the item still gets a tab — its
                 absence IS the finding on half these rows. */}
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
            {ORDER.map((k) => {
              const on = k === active;
              const has = !!clips[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActive(k)}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                    on ? "bg-accent/15 text-accent" : "text-subtle hover:bg-elevated hover:text-fg",
                  )}
                >
                  {SHORT[k]}
                  <span className="ml-1.5 font-normal opacity-70">
                    {has ? AV_DOCS[k].ref : "not on it"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── The document. Every page, in order, the marked one
                 scrolled to. */}
          <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-elevated/40 p-3 sm:p-4">
            {clip ? (
              <div className="mx-auto flex max-w-[64rem] flex-col gap-4">
                {pages.map(({ page }) => (
                  <PageSheet
                    key={page}
                    docKey={active}
                    page={page}
                    /* Only the page the item is on gets the box. The
                       others are the rest of the document, drawn plainly
                       — a highlight on every page would mark nothing. */
                    box={page === clip.page ? clip.box : null}
                    scrollTo={page === clip.page}
                    zoom={zoom}
                    label={label}
                    ref_={doc.ref}
                    caption={`Page ${page} of ${pages.length}`}
                  />
                ))}
              </div>
            ) : (
              <div className="mx-auto max-w-lg rounded-lg border border-line bg-card p-5 text-center">
                <p className="text-[13px] font-semibold text-fg">
                  {label} is not on the {SHORT[active].toLowerCase()}.
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  That is the finding, not a gap — an item quoted this year and
                  absent last year is new scope. Switch documents above to see
                  where it does appear.
                </p>
              </div>
            )}
          </div>

          <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10.5px] leading-snug text-subtle sm:px-4">
            {doc.title} · {doc.ref} · {doc.dated} — {pages.length} page{pages.length === 1 ? "" : "s"}, as sent by Livecast. Esc to close.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
