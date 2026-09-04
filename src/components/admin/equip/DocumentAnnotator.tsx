"use client";

/**
 * Reviewer-only document viewer with pinned comments, for one EQUIP
 * application's attachments.
 *
 * Why every page is an <img>
 *   Every other document preview in this codebase is an <iframe> at the
 *   file, which hands a PDF to the browser's built-in plugin. That
 *   plugin exposes no DOM and no coordinates, so there is nothing to
 *   anchor a pin to. Rendering pdf.js here in the client was the next
 *   thing tried, and its render() hangs in unpdf's bundled build. So
 *   the server rasterises each PDF page (.../document/page) and this
 *   just shows the picture — which makes a PDF page and an uploaded
 *   image exactly the same thing to annotate, and keeps ~1.6 MB of
 *   pdf.js out of the bundle.
 *
 * The pin geometry
 *   A note stores x/y as fractions of the page box, not pixels — the
 *   image is scaled by CSS to whatever width the panel has, so
 *   fractions are the only thing that survives a resize, a zoom, or a
 *   different monitor. Pins are positioned at `left: x*100%`, and the
 *   maths runs in exactly one direction in `pointToFraction` — read it
 *   once and every pin agrees.
 *
 * The original file is never modified. This reads it and stores
 * coordinates beside it; deleting every note leaves the upload
 * byte-identical.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Loader2, MessageSquarePlus, ChevronLeft, ChevronRight, Check,
  RotateCcw, Trash2, FileText, ImageIcon, AlertCircle, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnnotatableDocument {
  key: string;
  name: string;
  contentType: string;
  kind: string;
  size: number;
}

export interface DocumentNote {
  id: string;
  documentKey: string;
  page: number;
  x: number;
  y: number;
  body: string;
  status: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

/** A pending pin — placed, not yet saved. */
interface DraftPin { page: number; x: number; y: number }

const isPdf = (d: AnnotatableDocument) =>
  d.contentType === "application/pdf" || /\.pdf$/i.test(d.name);
const isImage = (d: AnnotatableDocument) =>
  d.contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif)$/i.test(d.name);
/** Anything we can draw is annotatable; everything else gets a download. */
const isViewable = (d: AnnotatableDocument) => isPdf(d) || isImage(d);

export function DocumentAnnotator({
  applicationId,
  documents,
  initialNotes = [],
  className,
}: {
  applicationId: string;
  documents: AnnotatableDocument[];
  initialNotes?: DocumentNote[];
  className?: string;
}) {
  const viewable = documents.filter(isViewable);
  const [activeKey, setActiveKey] = useState<string>(viewable[0]?.key ?? documents[0]?.key ?? "");
  const [notes, setNotes] = useState<DocumentNote[]>(initialNotes);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  /** The src that has finished loading. `rendering` is derived from it
   *  rather than reset by an effect — the spinner is a fact about which
   *  image is on screen, not a separate piece of state to keep in sync. */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftPin | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const active = documents.find((d) => d.key === activeKey) ?? null;
  /** The raw upload — used for images, and for the "open the file" link. */
  const fileUrl = active
    ? `/api/equip/applications/${applicationId}/document?key=${encodeURIComponent(active.key)}`
    : "";
  /** A rasterised PDF page. Same picture the pins are placed on. */
  const pageUrl = active
    ? `/api/admin/equip/applications/${applicationId}/document/page?key=${encodeURIComponent(active.key)}&page=${page}`
    : "";

  const currentSrc = active ? (isPdf(active) ? pageUrl : fileUrl) : "";
  const rendering = !!active && isViewable(active) && loadedSrc !== currentSrc && !renderError;

  const docNotes = notes.filter((n) => n.documentKey === activeKey);
  const visibleNotes = docNotes.filter((n) => showResolved || n.status !== "resolved");
  const pageNotes = visibleNotes.filter((n) => n.page === page);

  // ── How many pages does this PDF have ──────────────────────────
  // Only PDFs need asking; an image is always one page. The pages
  // themselves are plain <img> loads, so there is nothing else to
  // orchestrate here.
  useEffect(() => {
    // Images are one page; selectDocument already reset the count.
    if (!active || !isPdf(active)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/equip/applications/${applicationId}/document/page`
          + `?key=${encodeURIComponent(active.key)}&meta=1`,
        );
        if (!res.ok) throw new Error(`Couldn't read that PDF (HTTP ${res.status}).`);
        const j = (await res.json()) as { pageCount?: number };
        if (!cancelled) setPageCount(Math.max(1, j.pageCount ?? 1));
      } catch (e) {
        if (!cancelled) setRenderError(e instanceof Error ? e.message : "Couldn't read that PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [active, applicationId]);

  /** Switching attachments starts clean. An event handler, not an
   *  effect: this is a consequence of the click, not of the render. */
  function selectDocument(key: string) {
    setActiveKey(key);
    setPage(1);
    setPageCount(1);
    setDraft(null);
    setDraftBody("");
    setOpenNoteId(null);
    setError(null);
    setRenderError(null);
    setLoadedSrc(null);
  }

  /**
   * The one place a click becomes coordinates. Everything else reads
   * fractions, so there is a single definition of where a pin is.
   */
  const pointToFraction = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  function onSurfaceClick(e: React.MouseEvent<HTMLDivElement>) {
    // Clicks that land on an existing pin are that pin's business.
    if ((e.target as HTMLElement).closest("[data-pin]")) return;
    const pt = pointToFraction(e);
    if (!pt) return;
    setOpenNoteId(null);
    setDraft({ page, ...pt });
    setDraftBody("");
    setError(null);
  }

  async function api(init: RequestInit) {
    const res = await fetch(`/api/admin/equip/applications/${applicationId}/notes`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string; note?: DocumentNote };
    if (!res.ok) throw new Error(j.error ?? "That didn't work.");
    return j;
  }

  async function saveDraft() {
    if (!draft || !active || !draftBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const j = await api({
        method: "POST",
        body: JSON.stringify({
          documentKey: active.key, page: draft.page, x: draft.x, y: draft.y, body: draftBody,
        }),
      });
      if (j.note) setNotes((cur) => [...cur, j.note!]);
      setDraft(null);
      setDraftBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(note: DocumentNote, status: "open" | "resolved") {
    setBusy(true);
    setError(null);
    try {
      const j = await api({ method: "PATCH", body: JSON.stringify({ noteId: note.id, status }) });
      if (j.note) setNotes((cur) => cur.map((n) => (n.id === note.id ? j.note! : n)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: DocumentNote) {
    if (!confirm("Delete this note? The attachment itself isn't affected.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/equip/applications/${applicationId}/notes?noteId=${encodeURIComponent(note.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Couldn't delete that.");
      }
      setNotes((cur) => cur.filter((n) => n.id !== note.id));
      setOpenNoteId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (documents.length === 0) {
    return (
      <p className={cn("rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-muted", className)}>
        No attachments on this application.
      </p>
    );
  }

  const openCount = docNotes.filter((n) => n.status !== "resolved").length;

  return (
    <div className={cn("grid gap-3 lg:grid-cols-[1fr_18rem]", className)}>
      <div className="min-w-0 space-y-2">
        {/* Attachment switcher */}
        <div className="flex flex-wrap items-center gap-1.5">
          {documents.map((d) => {
            const on = d.key === activeKey;
            const count = notes.filter((n) => n.documentKey === d.key && n.status !== "resolved").length;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => selectDocument(d.key)}
                className={cn(
                  "inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ring-1 transition-colors",
                  on ? "bg-brand-600 text-white ring-brand-700" : "bg-card-solid text-fg ring-line hover:bg-elevated",
                )}
                title={d.name}
              >
                {isImage(d) ? <ImageIcon size={11} className="shrink-0" /> : <FileText size={11} className="shrink-0" />}
                <span className="truncate">{d.name}</span>
                {count > 0 && (
                  <span className={cn(
                    "shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    on ? "bg-white/25" : "bg-amber-100 text-amber-800",
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Page surface */}
        {active && isViewable(active) ? (
          <div className="rounded-xl border border-line bg-elevated/30 p-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[11px] text-muted">
                <span className="font-semibold text-fg">Click anywhere on the page</span> to pin a note. Reviewers only — the applicant never sees these, and the file itself is untouched.
              </p>
              {isPdf(active) && pageCount > 1 && (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || rendering}
                    className="rounded-md border border-line bg-card-solid p-1 text-muted hover:text-fg disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="min-w-[5rem] text-center text-[11px] tabular-nums text-muted">
                    Page {page} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page >= pageCount || rendering}
                    className="rounded-md border border-line bg-card-solid p-1 text-muted hover:text-fg disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight size={13} />
                  </button>
                </span>
              )}
            </div>

            <div
              onClick={onSurfaceClick}
              className="relative mx-auto max-w-3xl cursor-crosshair overflow-hidden rounded-lg bg-white shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- streamed
                  from R2 behind an auth'd route; next/image can't fetch it.
                  A PDF page arrives already rasterised, an image as itself —
                  either way it's one <img>, which is what lets the pin layer
                  below be identical for both. */}
              <img
                key={currentSrc}
                src={currentSrc}
                alt={isPdf(active) ? `${active.name} — page ${page}` : active.name}
                className="block w-full"
                onLoad={() => setLoadedSrc(currentSrc)}
                onError={() => setRenderError("Couldn't render this page.")}
              />

              {rendering && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <Loader2 size={20} className="animate-spin text-brand-600" />
                </div>
              )}

              {/* Saved pins */}
              {pageNotes.map((n, i) => (
                <PinMarker
                  key={n.id}
                  n={n}
                  index={i + 1}
                  open={openNoteId === n.id}
                  onToggle={() => { setDraft(null); setOpenNoteId(openNoteId === n.id ? null : n.id); }}
                  onResolve={() => setStatus(n, n.status === "resolved" ? "open" : "resolved")}
                  onDelete={() => remove(n)}
                  busy={busy}
                />
              ))}

              {/* The pin being written */}
              {draft && draft.page === page && (
                <div
                  data-pin
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}
                >
                  <div className="h-4 w-4 animate-pulse rounded-full bg-brand-600 ring-2 ring-white" />
                  <div className="absolute left-5 top-0 w-64 cursor-auto rounded-lg border border-line bg-card-solid p-2 shadow-elevated">
                    <textarea
                      autoFocus
                      rows={3}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      placeholder="What's worth flagging here?"
                      className="w-full rounded-md border border-line bg-elevated/40 px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    {error && <p className="mt-1 text-[11px] font-medium text-rose-700">{error}</p>}
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setDraft(null); setDraftBody(""); setError(null); }}
                        className="px-2 py-1 text-[11.5px] font-semibold text-muted hover:text-fg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={busy || !draftBody.trim()}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <MessageSquarePlus size={11} />}
                        Pin note
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {renderError && (
              <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] font-medium text-rose-700">
                <AlertCircle size={12} /> {renderError}
              </p>
            )}
          </div>
        ) : (
          active && (
            <div className="rounded-xl border border-line bg-elevated/30 p-6 text-center">
              <p className="text-[12.5px] text-muted">
                <strong className="text-fg">{active.name}</strong> can&apos;t be shown inline, so there&apos;s nothing to pin a note to.
              </p>
              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700"
              >
                <Download size={12} /> Open the file
              </a>
            </div>
          )
        )}
      </div>

      {/* Note rail */}
      <aside className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            Notes {openCount > 0 && <span className="text-amber-700">· {openCount} open</span>}
          </p>
          {docNotes.some((n) => n.status === "resolved") && (
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="text-[11px] font-semibold text-muted hover:text-fg"
            >
              {showResolved ? "Hide resolved" : "Show resolved"}
            </button>
          )}
        </div>

        {visibleNotes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-muted">
            No notes on this attachment yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleNotes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => { setPage(n.page); setOpenNoteId(n.id); setDraft(null); }}
                  className={cn(
                    "w-full rounded-lg border p-2 text-left transition-colors",
                    openNoteId === n.id ? "border-brand-400 bg-brand-50/60" : "border-line bg-card-solid hover:bg-elevated/50",
                    n.status === "resolved" && "opacity-60",
                  )}
                >
                  <p className={cn("text-[12px] leading-snug text-fg", n.status === "resolved" && "line-through")}>
                    {n.body}
                  </p>
                  <p className="mt-1 text-[10px] text-subtle">
                    {n.authorName} · p.{n.page}
                    {n.status === "resolved" && " · resolved"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && !draft && <p className="text-[11px] font-medium text-rose-700">{error}</p>}
      </aside>
    </div>
  );
}

function PinMarker({
  n, index, open, onToggle, onResolve, onDelete, busy,
}: {
  n: DocumentNote;
  index: number;
  open: boolean;
  onToggle: () => void;
  onResolve: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div
      data-pin
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white transition-transform hover:scale-110",
          n.status === "resolved" ? "bg-emerald-600" : "bg-amber-500",
        )}
        aria-label={`Note ${index}: ${n.body.slice(0, 60)}`}
      >
        {index}
      </button>

      {open && (
        <div className="absolute left-6 top-0 w-64 cursor-auto rounded-lg border border-line bg-card-solid p-2 shadow-elevated">
          <p className="text-[12px] leading-snug text-fg">{n.body}</p>
          <p className="mt-1 text-[10px] text-subtle">
            {n.authorName} · {new Date(n.createdAt).toLocaleDateString()}
          </p>
          <div className="mt-1.5 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={11} /> Delete
            </button>
            <button
              type="button"
              onClick={onResolve}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-1 text-[11px] font-semibold text-fg hover:bg-elevated/70 disabled:opacity-50"
            >
              {n.status === "resolved" ? <><RotateCcw size={11} /> Reopen</> : <><Check size={11} /> Resolve</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
