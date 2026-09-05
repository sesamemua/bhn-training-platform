"use client";

import { useEffect, useRef, useState } from "react";
import { X, Maximize2, Minimize2, ZoomIn, ZoomOut, Pin, PinOff, ExternalLink } from "lucide-react";
import {
  AV_DOCS, clipsFor, pageOf, clipUrl, type AvDoc,
} from "@/lib/symposium/av";
import { cn } from "@/lib/utils";

const ORDER: AvDoc["key"][] = ["q2025", "i2025", "q2026"];
const SHORT: Record<AvDoc["key"], string> = {
  q2025: "2025 quote", i2025: "2025 actual", q2026: "2026 quote",
};

/**
 * What the three documents actually print about one line item.
 *
 * The first version of this was a small floating card that only appeared
 * above 1280px and had pointer-events-none, so its own scroll area could
 * not be scrolled and half the screens never saw it at all. This is a
 * real panel: it docks beside the table on wide screens, becomes a sheet
 * on narrow ones, and you can interact with it.
 *
 * Two modes matter. ROW is the cropped line, which answers "what does
 * this document say about this item". PAGE is the whole page with that
 * row outlined, which answers "and what is around it" — the question you
 * get to about ten seconds later, and the one the old panel could not
 * answer at all.
 *
 * Zoom exists because these crops are rendered at 2.4× and shown at
 * whatever width the dock happens to be. On a laptop that is small type.
 */
export function AvSourcePanes({
  lineKey, label, pinned, onPin, onClose, variant, mode, onMode, onOpenDoc,
}: {
  lineKey: string;
  label: string;
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
  variant: "dock" | "sheet";
  /* Owned by the parent, not by this component, because this component
     is remounted on every hover (key={lineKey}) to reset zoom and
     scroll. Local state here would survive exactly until the mouse
     crossed the next row — a toggle you can press but cannot hold. */
  mode: "row" | "page";
  onMode: (next: "row" | "page") => void;
  /** Open the whole document, this line marked on it. */
  onOpenDoc: (docKey: AvDoc["key"]) => void;
}) {
  const clips = clipsFor(lineKey);
  const [zoom, setZoom] = useState(1);

  /* A new row resets mode, zoom and scroll — carrying a previous zoom or
     a mid-document scroll position across items is disorienting, you look
     up and are somewhere you did not choose.
     
     That reset is done by the parent giving this component key={lineKey},
     so React remounts it with fresh state. Doing it in an effect instead
     renders the stale view once and then corrects it, which is both a
     visible flicker and the thing the lint rule is there to stop. */

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, onClose]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden border border-line bg-card",
        variant === "dock"
          /* Full height, not 52rem of it. The cap left 229px of empty
             column under the panel on a 1077px-tall screen, and the
             taller the display the more it wasted — backwards for a
             panel whose whole job is showing a page of A4. 2rem is the
             sticky top-4 plus as much again at the bottom. */
          ? "h-[calc(100vh-2rem)] rounded-2xl"
          : "h-[min(80vh,44rem)] rounded-t-2xl shadow-2xl",
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-fg">{label}</p>
          <p className="text-[10px] uppercase tracking-wider font-bold text-subtle">
            as printed · {mode === "row" ? "the row" : "full page"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}
            label="Zoom out" disabled={zoom <= 0.6}><ZoomOut size={13} /></IconBtn>
          <span className="w-9 text-center text-[10px] tabular-nums text-subtle">
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn onClick={() => setZoom((z) => Math.min(2.4, +(z + 0.2).toFixed(1)))}
            label="Zoom in" disabled={zoom >= 2.4}><ZoomIn size={13} /></IconBtn>
          <IconBtn onClick={() => onMode(mode === "row" ? "page" : "row")}
            label={mode === "row" ? "Show the whole page" : "Show just the row"} active={mode === "page"}>
            {mode === "row" ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
          </IconBtn>
          <IconBtn onClick={onPin} label={pinned ? "Unpin — follow the mouse again" : "Pin this row"} active={pinned}>
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </IconBtn>
          {variant === "sheet" && <IconBtn onClick={onClose} label="Close"><X size={14} /></IconBtn>}
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
        {ORDER.map((k) => {
          const clip = clips[k];
          const doc = AV_DOCS[k];
          return (
            <div key={k} className="px-3 py-2.5">
              <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-[10px] uppercase tracking-wider font-bold">
                <span className={k === "q2026" ? "text-accent" : "text-subtle"}>{SHORT[k]}</span>
                <span className="normal-case tracking-normal font-normal text-subtle">
                  {doc.ref}{clip ? ` · p${clip.page}` : ""}
                </span>
                {clip && (
                  <a
                    href={clipUrl(mode === "row" ? clip.file : clip.pageFile)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 normal-case tracking-normal font-semibold text-accent hover:underline"
                  >
                    open <ExternalLink size={10} aria-hidden />
                  </a>
                )}
              </p>

              {clip ? (
                mode === "row" ? (
                  <div className="overflow-x-auto rounded-md bg-white ring-1 ring-inset ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={clipUrl(clip.file)}
                      alt={`${label} as it appears on ${doc.ref}`}
                      width={clip.w} height={clip.h}
                      style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
                      /* Eager, never lazy. The lazy heuristic misfires in a
                         panel that appears on demand: the image is offscreen
                         when the browser decides, so the pane opens blank and
                         fills in a beat later, which reads as broken. Same
                         trap the merch board hit. */
                      className="block" loading="eager" decoding="sync"
                    />
                  </div>
                ) : (
                  <PageSheet
                    docKey={k}
                    page={clip.page}
                    box={clip.box}
                    scrollTo
                    zoom={zoom}
                    label={label}
                    ref_={doc.ref}
                    maxH="22rem"
                    onOpen={() => onOpenDoc(k)}
                  />
                )
              ) : (
                <p className="rounded-md bg-elevated px-2.5 py-2 text-[11px] italic text-subtle">
                  This item does not appear on {SHORT[k].toLowerCase()}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="shrink-0 border-t border-line px-3 py-1.5 text-[10.5px] leading-snug text-subtle">
        {pinned
          ? "Pinned. Esc or the pin button to follow the table again."
          : "Following the table — click a row to pin it."}
      </p>
    </div>
  );
}

/**
 * One rendered page, optionally with a row outlined and scrolled to.
 *
 * The box comes from the manifest as top/bottom fractions of page
 * height, so it lands correctly whatever width the container is and
 * whatever zoom the render used. Positioning it in pixels would have
 * tied it to the 2× the pages happen to be rendered at.
 *
 * Shared by the dock and the full-document viewer. One implementation of
 * "where on this page is that line", because two would disagree — this
 * codebase has shipped that bug twice already.
 */
export function PageSheet({
  docKey, page, box, scrollTo, zoom, label, ref_, maxH, caption, onOpen, markRef,
}: {
  docKey: AvDoc["key"];
  page: number;
  /** null draws the page plainly — the rest of a document you are reading. */
  box: [number, number] | null;
  scrollTo: boolean;
  zoom: number;
  label: string;
  ref_: string;
  /** Caps the page's own scroller. Absent = grow to fit the parent. */
  maxH?: string;
  caption?: string;
  /** When set, the artwork becomes a button that opens the whole document. */
  onOpen?: () => void;
  /** The viewer scrolls its own body to this, so it needs the node too. */
  markRef?: (el: HTMLDivElement | null) => void;
}) {
  const render = pageOf(docKey, page);
  const mark = useRef<HTMLDivElement | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  /*
   * Centre the mark inside THIS pane, and nothing else.
   *
   * scrollIntoView() scrolls every scrollable ancestor it can find, and
   * on this page one of those is <main>. So running the mouse down the
   * table scrolled the table itself — up to 142px in one hop, measured —
   * and the row you were reaching for slid out from under the cursor.
   * Writing scrollTop on the one element that should move cannot do
   * that to anybody.
   *
   * A no-op in the viewer, where the pages are not height-capped and so
   * have nothing to scroll; the viewer scrolls its own body to the
   * marked page instead.
   */
  useEffect(() => {
    if (!scrollTo) return;
    const box = mark.current;
    const view = pane.current;
    if (!box || !view || view.scrollHeight <= view.clientHeight) return;
    view.scrollTop = Math.max(0, box.offsetTop - (view.clientHeight - box.offsetHeight) / 2);
  }, [scrollTo, docKey, page, zoom]);
  if (!render) return null;

  const art = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={clipUrl(render.file)}
        alt={box ? `Page ${page} of ${ref_}, showing ${label}` : `Page ${page} of ${ref_}`}
        width={render.w} height={render.h}
        className="block w-full" loading="eager" decoding="sync"
      />
      {box && (
        <div
          ref={(el) => { mark.current = el; markRef?.(el); }}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 rounded-[3px] bg-amber-300/20 ring-2 ring-amber-500"
          style={{ top: `${box[0] * 100}%`, height: `${(box[1] - box[0]) * 100}%` }}
        />
      )}
    </>
  );

  return (
    <figure className="m-0">
      <div
        ref={pane}
        className="overflow-auto rounded-md bg-white ring-1 ring-inset ring-line"
        style={maxH ? { maxHeight: maxH } : undefined}
      >
        {/* The artwork itself is the target, not the scroller around it:
            a click that lands after a drag-scroll should not open
            anything. The highlight above is pointer-events-none, so the
            amber box never swallows the click. */}
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            title="Open the whole document"
            className="relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
          >
            {art}
          </button>
        ) : (
          <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
            {art}
          </div>
        )}
      </div>
      {caption && (
        <figcaption className="mt-1 text-center text-[10.5px] tabular-nums text-subtle">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function IconBtn({
  children, onClick, label, active, disabled, ref_,
}: {
  children: React.ReactNode; onClick: () => void; label: string;
  active?: boolean; disabled?: boolean;
  ref_?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref_}
      type="button" onClick={onClick} title={label} aria-label={label} disabled={disabled}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        disabled ? "text-subtle/40" : active
          ? "bg-accent/15 text-accent"
          : "text-subtle hover:bg-elevated hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
