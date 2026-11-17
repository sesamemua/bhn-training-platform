"use client";

/**
 * One artwork under review. Click anywhere on the picture to pin a comment
 * there; pins are numbered, open as a thread beside themselves (replies,
 * resolve, delete), and are listed down the side. The side panel also says
 * where everyone stands — seen it, OK'd it — and carries the approver's
 * decision.
 *
 * Positions are kept as a share of the page's width and height, so a pin
 * stays on the same spot at any zoom or screen size.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, CircleDashed, Copy, Crosshair, ExternalLink, Eye, Loader2, Lock, MessageSquarePlus, Minus, Move, Plus, RotateCcw, Send, X } from "lucide-react";
import { APPROVAL_LABEL, designBrief, isWide, type Approval, type Page, type Seen } from "@/lib/design-review/types";
import {
  addDesignPin, deleteDesignPin, editDesignPin, lockDesignRound, markDesignSeen, replyDesignPin, requestDesignReview, resolveDesignPin,
  setDesignApproval, setDesignOk, startDesignRound,
} from "@/lib/design-review/actions";
import { ConfirmPopover } from "@/components/ui/ConfirmPopover";
import { DesignRevisionCompare } from "./DesignRevisionCompare";
import { ReviewGroupInvite } from "./ReviewGroupInvite";
import { ReviewSentHistory } from "./ReviewSentHistory";
import { designReviewSentHistory, sendDesignReviewGroup } from "@/lib/design-review/review-tools";
import type { DesignVersion } from "@/lib/design-review/versions";

export interface PinRow { id: string; page: number; x: number; y: number; parentId: string | null; authorId: string | null; authorName: string; body: string; status: string; round: number; createdAt: string }
export interface ArtworkViewData {
  id: string; title: string; description: string; pages: Page[];
  approval: Approval; approvalNote: string; approvalAt: string | null;
  /** The feedback round, whether it is locked, and the project's name (for the copied feedback). */
  round: number; locked: boolean; project: string;
  versions?: DesignVersion[];
  pins: PinRow[];
  reviewers: { id: string; name: string; state: Seen; asked: boolean }[];
}

const APPROVAL_TONE: Record<Approval, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  approved: "bg-emerald-500/15 text-emerald-700",
  changes: "bg-rose-500/15 text-rose-700",
};
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];

export function DesignArtworkView({ artwork, me, approver, embedded = false, fullPage = false }: {
  artwork: ArtworkViewData;
  me: { id: string; name: string; admin: boolean };
  approver: { id: string; name: string } | null;
  /** Inside another page's card (a social post): stacked, nothing pinned, and no approval —
   *  the host page keeps its own. */
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<{ page: number; x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(true);
  const [note, setNote] = useState(artwork.approvalNote);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [floatingAt, setFloatingAt] = useState<{ left: number; top: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [viewRound, setViewRound] = useState<number | null>(null);
  const floating = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const locked = artwork.locked;
  // A wide strip (the one-pagers) needs the whole width to be readable: its panels go on top, in a row.
  const wide = isWide(artwork.pages[0]);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Seen — recorded once the page is really on screen, not when it is merely fetched.
  useEffect(() => {
    const mark = () => { if (document.visibilityState === "visible") { void markDesignSeen(artwork.id); document.removeEventListener("visibilitychange", mark); } };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [artwork.id]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error ?? "That didn't save — try again."); return; }
    after?.();
    router.refresh();
  });

  const threads = artwork.pins.filter((p) => !p.parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numberOf = new Map(threads.map((t, i) => [t.id, i + 1]));
  const repliesOf = (id: string) => artwork.pins.filter((p) => p.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = threads.filter((t) => t.status === "open").length;
  const mine = artwork.reviewers.find((r) => r.id === me.id);
  const iOk = mine?.state === "ok";
  const isApprover = approver?.id === me.id;

  const reviewPath = `/review/design/${encodeURIComponent(artwork.id)}`;
  const versions = [...(artwork.versions ?? []).filter(({ round }) => round < artwork.round), { round: artwork.round, pages: artwork.pages }];
  const previous = threads.filter((thread) => thread.round < artwork.round);
  const current = threads.filter((thread) => thread.round === artwork.round);
  const archivedView = versions.find(({ round }) => round === viewRound && round !== artwork.round);
  const visiblePages = archivedView?.pages ?? artwork.pages;
  const targetVersion = (thread: PinRow) => versions.find(({ round }) => round === thread.round) ?? versions.at(-1)!;
  const pinFits = (thread: PinRow) => !!visiblePages[thread.page] && targetVersion(thread).pages[thread.page]?.key === visiblePages[thread.page].key;

  const copyFeedback = async () => {
    const text = designBrief({ project: artwork.project, title: artwork.title, round: artwork.round, pages: artwork.pages.length, pins: artwork.pins });
    try { await navigator.clipboard.writeText(text); } catch { setError("Your browser blocked copying — allow clipboard access and try again."); return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const place = (page: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (locked || archivedView) return;
    if ((e.target as HTMLElement).closest("[data-pin],[data-card]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    setOpenId(null);
    setDraftText("");
    setDraft({ page, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  const jump = (t: PinRow) => {
    const version = targetVersion(t);
    if (!version.pages[t.page]) { setError("The artwork for this earlier pin is no longer available."); return; }
    setError(null);
    setDraft(null);
    setOpenId(t.id);
    if (t.status !== "open") setShowResolved(true);
    if (!pinFits(t)) setViewRound(version.round === artwork.round ? null : version.round);
    requestAnimationFrame(() => {
      const pin = pageRefs.current.get(t.page)?.querySelector<HTMLElement>(`[data-pin="${CSS.escape(t.id)}"]`);
      const frame = scrollerRef.current;
      if (!pin || !frame) return;
      const p = pin.getBoundingClientRect(), f = frame.getBoundingClientRect();
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      frame.scrollTo({ left: frame.scrollLeft + p.left - f.left - f.width / 2, top: frame.scrollTop + p.top - f.top - f.height / 2, behavior: still ? "auto" : "smooth" });
      flash(t.id, 280);
    });
  };
  /** A card beside a point: to its right and below, flipped near the right or bottom edge. */
  const beside = (x: number, y: number): React.CSSProperties => ({
    ...(x > 0.6 ? { right: `${(1 - x) * 100}%`, marginRight: 18 } : { left: `${x * 100}%`, marginLeft: 18 }),
    ...(y > 0.7 ? { bottom: `${(1 - y) * 100}%` } : { top: `${y * 100}%` }),
  });

  function flash(id: string, delay = 0) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    window.setTimeout(() => {
      const pin = scrollerRef.current?.querySelector<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`);
      pin?.getAnimations().forEach((animation) => animation.cancel());
      pin?.animate([{ outline: "0 solid transparent" }, { outline: "6px solid #f59e0b" }, { outline: "0 solid transparent" }], { duration: 160, iterations: 5 });
    }, delay);
  }
  const threadList = (rows: PinRow[]) => <ol className="mt-2 space-y-1">
    {rows.filter((t) => showResolved || t.status === "open").map((t) => <li key={t.id} onPointerEnter={() => flash(t.id)} className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-elevated">
      <span className="shrink-0 text-xs font-bold text-brand-700">{numberOf.get(t.id)}</span>
      <span className="min-w-0 flex-1 text-xs"><span className="line-clamp-2 break-words">{t.body}</span><span className="text-muted">{t.authorName} · R{t.round}{t.status !== "open" ? " · Resolved" : ""}</span></span>
      <button type="button" aria-label={`Show me comment ${numberOf.get(t.id)}`} onClick={() => jump(t)} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700"><Crosshair size={12} />Show me</button>
    </li>)}
  </ol>;

  return (
    <div className={embedded ? "flex flex-col gap-3" : wide ? "flex flex-col-reverse gap-4" : "grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]"}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          {archivedView ? <><span className="font-semibold text-fg">Viewing Round {archivedView.round}</span>
            <button type="button" onClick={() => { setViewRound(null); setOpenId(null); }} className="rounded-md border border-line px-2 py-1 font-semibold">Back to current artwork</button></> : locked
            ? <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><Lock size={14} /> Round {artwork.round} is locked — start the next round to comment again</span>
            : <span className="inline-flex items-center gap-1.5 font-semibold text-fg"><MessageSquarePlus size={14} /> Round {artwork.round} · Click anywhere on the artwork to comment</span>}
          <span className="ml-auto inline-flex items-center gap-1">
            <button type="button" aria-label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} className="rounded-md border border-line p-1 text-fg disabled:opacity-40"><Minus size={13} /></button>
            <span className="w-12 text-center tabular-nums text-fg">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom === ZOOMS.at(-1)} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} className="rounded-md border border-line p-1 text-fg disabled:opacity-40"><Plus size={13} /></button>
          </span>
          <label className="inline-flex items-center gap-1.5">
            <input id="design-show-resolved" type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-brand-600" /> Show resolved
          </label>
        </div>

        {/* Room under the last page, so a comment card opened low on a short artwork is not cut off. */}
        <div ref={scrollerRef} className={`overflow-auto rounded-xl border border-line bg-elevated/40 p-3 pb-80 ${embedded ? "max-h-[60vh]" : wide ? "max-h-[62vh]" : "max-h-[78vh]"}`}>
          <div className="mx-auto space-y-4" style={{ width: `${zoom * 100}%` }}>
            {visiblePages.map((pg, i) => (
              <div key={pg.key}>
                {visiblePages.length > 1 && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Page {i + 1}</p>}
                <div
                  ref={(el) => { if (el) pageRefs.current.set(i, el); else pageRefs.current.delete(i); }}
                  onClick={(e) => place(i, e)}
                  className={`relative select-none bg-white shadow-md ${locked || archivedView ? "cursor-default" : "cursor-crosshair"}`}
                  style={{ aspectRatio: `${pg.w} / ${pg.h}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pg.url} alt={`${artwork.title}${visiblePages.length > 1 ? ` — page ${i + 1}` : ""}`} draggable={false} className="block h-full w-full" />

                  {threads.filter((t) => t.page === i && pinFits(t) && (t.round === artwork.round || showPrevious || t.id === openId) && (showResolved || t.status === "open" || t.id === openId)).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-pin={t.id}
                      onClick={() => { setDraft(null); setReply(""); setEditing(null); setOpenId(openId === t.id ? null : t.id); }}
                      aria-label={`Comment ${numberOf.get(t.id)} by ${t.authorName}${t.status === "open" ? "" : " (resolved)"}`}
                      className={`absolute z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[12px] font-bold text-white shadow-lg transition-transform hover:scale-110 ${
                        t.status === "open" ? "bg-rose-600" : "bg-slate-400"
                      } ${openId === t.id ? "ring-4 ring-brand-400/60" : ""}`}
                      style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
                    >
                      {numberOf.get(t.id)}
                    </button>
                  ))}

                  {threads.filter((t) => t.page === i && t.id === openId).map((t) => (
                    <div key={`card-${t.id}`} data-card className="absolute z-20 w-72 cursor-auto rounded-xl border border-line bg-card-solid p-3 text-left shadow-2xl" style={beside(t.x, t.y)}>
                      <div className="flex items-center gap-2">
                        <span className={`grid h-5 w-5 place-items-center rounded-full text-[10.5px] font-bold text-white ${t.status === "open" ? "bg-rose-600" : "bg-slate-400"}`}>{numberOf.get(t.id)}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{t.status === "open" ? "Open" : "Resolved"} · Round {t.round}</span>
                        <button type="button" aria-label="Close" onClick={() => setOpenId(null)} className="ml-auto rounded p-0.5 text-subtle hover:text-fg"><X size={13} /></button>
                      </div>
                      <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                        {[t, ...repliesOf(t.id)].map((c) => (
                          <li key={c.id} className="text-[12.5px]">
                            <p className="flex items-baseline gap-1.5"><strong className="text-fg">{c.authorName}</strong><span className="text-[10.5px] text-subtle">{when(c.createdAt)}</span></p>
                            {editing?.id === c.id ? (
                              <div className="mt-1">
                                <textarea id={`pin-edit-${c.id}`} aria-label="Edit comment" value={editing.text} rows={3} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} className="w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg" />
                                <div className="mt-1 flex gap-1.5">
                                  <button type="button" disabled={pending || !editing.text.trim()} onClick={() => run(() => editDesignPin(c.id, editing.text), () => setEditing(null))} className="rounded-md bg-brand-600 px-2 py-0.5 text-[11.5px] font-semibold text-white disabled:opacity-50">Save</button>
                                  <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] font-semibold text-fg">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap leading-snug text-fg">{c.body}</p>
                            )}
                            {!locked && (c.authorId === me.id || me.admin) && editing?.id !== c.id && (
                              deleting === c.id ? (
                                // Asked on the same line, in place: a pop-up here opened inside the
                                // scrolling list and hid its own Delete button.
                                <p className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-rose-500/10 px-1.5 py-1 text-[11px]">
                                  <span className="font-semibold text-rose-700">{c.parentId ? "Delete this reply?" : "Delete this comment and its replies?"}</span>
                                  <button type="button" disabled={pending} onClick={() => run(() => deleteDesignPin(c.id), () => { setDeleting(null); if (!c.parentId) setOpenId(null); })} className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-700 disabled:opacity-50">Delete</button>
                                  <button type="button" onClick={() => setDeleting(null)} className="font-semibold text-muted hover:text-fg">Keep</button>
                                </p>
                              ) : (
                                <p className="mt-0.5 flex gap-2 text-[11px]">
                                  <button type="button" onClick={() => setEditing({ id: c.id, text: c.body })} className="font-semibold text-muted hover:text-fg">Edit</button>
                                  <button type="button" onClick={() => setDeleting(c.id)} className="font-semibold text-muted hover:text-rose-600">Delete</button>
                                </p>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                      {!locked && <>
                      <textarea id={`pin-reply-${t.id}`} aria-label="Reply" value={reply} rows={2} placeholder="Reply…" onChange={(e) => setReply(e.target.value)} className="mt-2 w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg" />
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <button type="button" disabled={pending || !reply.trim()} onClick={() => run(() => replyDesignPin(t.id, reply), () => setReply(""))} className="rounded-md bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">Reply</button>
                        <button type="button" disabled={pending} onClick={() => run(() => resolveDesignPin(t.id, t.status === "open"))} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg hover:bg-elevated">
                          {t.status === "open" ? <><Check size={12} /> Resolve</> : <><RotateCcw size={12} /> Reopen</>}
                        </button>
                      </div>
                      </>}
                    </div>
                  ))}

                  {draft?.page === i && (
                    <>
                      <span aria-hidden className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600 shadow-lg ring-4 ring-brand-400/50" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} />
                      <div data-card className="absolute z-20 w-72 cursor-auto rounded-xl border border-line bg-card-solid p-3 text-left shadow-2xl" style={beside(draft.x, draft.y)}>
                        <label htmlFor="pin-new" className="text-[11px] font-semibold uppercase tracking-wide text-subtle">New comment here</label>
                        <textarea id="pin-new" autoFocus value={draftText} rows={3} placeholder="What should change, or what do you like?" onChange={(e) => setDraftText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); }}
                          className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg" />
                        <div className="mt-1.5 flex gap-1.5">
                          <button type="button" disabled={pending || !draftText.trim()} onClick={() => run(() => addDesignPin(artwork.id, { ...draft, body: draftText }), () => { setDraft(null); setDraftText(""); })} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
                            {pending && <Loader2 size={12} className="animate-spin" />} Comment
                          </button>
                          <button type="button" onClick={() => setDraft(null)} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg">Cancel</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-rose-600">{error}</p>}
      </div>

      {/* The review panel stays in view while you look at the artwork: pinned to the top for a
          wide piece (where it sits above), pinned beside it otherwise — from tablet width up, so
          it does not drop underneath on a smaller window. */}
      <aside className={embedded
        ? "grid items-start gap-3 sm:grid-cols-2"
        : wide
        ? "sticky top-0 z-30 grid items-start gap-3 rounded-xl bg-card-solid p-2 shadow-lg md:grid-cols-3"
        : "space-y-3 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:self-start md:overflow-y-auto"}>
        <section className={`rounded-xl border border-line bg-card p-3 ${embedded ? "hidden" : ""}`}>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-subtle">Approval</h3>
          <p className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${APPROVAL_TONE[artwork.approval]}`}>{APPROVAL_LABEL[artwork.approval]}</p>
          <p className="mt-1 text-[12px] text-muted">
            {approver ? <>Approver: <strong className="text-fg">{approver.name}</strong></> : "No approver set for this project."}
            {artwork.approvalAt && <> · {when(artwork.approvalAt)}</>}
          </p>
          {artwork.approvalNote && !isApprover && <p className="mt-1 whitespace-pre-wrap rounded-md bg-elevated/60 p-2 text-[12px] text-fg">{artwork.approvalNote}</p>}
          {isApprover && (
            <div className="mt-2 space-y-1.5">
              <textarea id="approval-note" aria-label="A note with your decision" value={note} rows={2} placeholder="A note with your decision (optional)" onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border border-line bg-card px-2 py-1 text-[12.5px] text-fg" />
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={pending} onClick={() => run(() => setDesignApproval(artwork.id, "approved", note))} className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">Approve</button>
                <button type="button" disabled={pending} onClick={() => run(() => setDesignApproval(artwork.id, "changes", note))} className="rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50">Request changes</button>
                {artwork.approval !== "pending" && <button type="button" disabled={pending} onClick={() => run(() => setDesignApproval(artwork.id, "pending", ""), () => setNote(""))} className="rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-fg">Clear</button>}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-card p-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-subtle">Who has looked</h3>
          <ul className="mt-1.5 space-y-1">
            {artwork.reviewers.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[12.5px]">
                {r.state === "ok" ? <CheckCircle2 size={14} className="text-emerald-600" /> : r.state === "viewed" ? <Eye size={14} className="text-sky-600" /> : <CircleDashed size={14} className="text-subtle" />}
                <span className={r.state === "none" ? "text-muted" : "text-fg"}>{r.name}{r.id === me.id ? " (you)" : ""}</span>
                <span className="ml-auto text-[11px] text-subtle">{r.state === "ok" ? "OK'd" : r.state === "viewed" ? "Seen" : r.asked ? "Asked" : "Not yet"}</span>
                {r.id !== me.id && r.state !== "ok" && (
                  <ConfirmPopover message={`Email ${r.name} a request to review this?`} detail="They get a link to this artwork." confirmLabel="Send request" onConfirm={() => run(() => requestDesignReview(artwork.id, r.id, ""))}>
                    {(o) => <button type="button" disabled={pending} onClick={o} aria-label={`Ask ${r.name} to review`} title={r.asked ? "Ask again" : "Ask to review"} className="rounded p-0.5 text-subtle hover:text-brand-600"><Send size={12} /></button>}
                  </ConfirmPopover>
                )}
              </li>
            ))}
          </ul>
          <button type="button" disabled={pending} onClick={() => run(() => setDesignOk(artwork.id, !iOk))} aria-pressed={iOk}
            className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${iOk ? "border border-emerald-500 bg-emerald-500/10 text-emerald-700" : "bg-brand-600 text-white hover:bg-brand-700"}`}>
            <Check size={13} /> {iOk ? "You OK'd this — undo" : "I'm OK with this"}
          </button>
        </section>

        <section ref={floating} className={`rounded-lg border border-line p-3 ${floatingAt ? "fixed z-50 max-h-[75dvh] w-[min(20rem,calc(100vw-1rem))] overflow-auto bg-card/90 shadow-xl backdrop-blur-md" : "bg-card"}`}
          style={floatingAt ? { ...floatingAt, resize: "both", maxWidth: "calc(100vw - 1rem)" } : undefined}>
          <div className="flex items-center gap-2">
            <h3 className="mr-auto text-xs font-bold">Round {artwork.round} · {open} open</h3>
            <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="rounded border border-line px-2 py-1 text-xs">{collapsed ? "Expand" : "Collapse"}</button>
            <button type="button" aria-pressed={!!floatingAt} aria-label={floatingAt ? "Dock comments" : "Float comments"} title={floatingAt ? "Dock comments" : "Float comments"} onClick={() => setFloatingAt(floatingAt ? null : { left: Math.max(8, window.innerWidth - 328), top: 64 })} className="rounded border border-line p-1.5"><Move size={14} /></button>
          </div>
          {floatingAt && <button type="button" aria-label="Move comments panel" className="mt-2 w-full cursor-grab touch-none rounded bg-elevated p-1 text-xs" onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX - floatingAt.left, y: event.clientY - floatingAt.top };
          }} onPointerMove={(event) => {
            if (!drag.current) return;
            setFloatingAt({ left: Math.max(0, Math.min(window.innerWidth - (floating.current?.offsetWidth ?? 320), event.clientX - drag.current.x)),
              top: Math.max(0, Math.min(window.innerHeight - 100, event.clientY - drag.current.y)) });
          }} onLostPointerCapture={() => { drag.current = null; }}>Drag panel</button>}
          {!collapsed && <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!fullPage && <a href={reviewPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-semibold"><ExternalLink size={13} />Open full-page review</a>}
            <button type="button" className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold" onClick={async () => {
              try { await navigator.clipboard.writeText(new URL(reviewPath, window.location.origin).href); setError(null); }
              catch { setError("Could not copy the review link."); }
            }}>Copy review link</button>
            <button type="button" disabled={pending} onClick={copyFeedback} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Comments copied" : "Copy review comments"}
            </button>
            {!locked && <ConfirmPopover message={`Lock Round ${artwork.round}?`} detail="Reviewers cannot change feedback until the next round." confirmLabel="Lock round" onConfirm={() => run(() => lockDesignRound(artwork.id), () => { setDraft(null); setEditing(null); })}>
              {(openConfirm) => <button type="button" onClick={openConfirm} disabled={pending} className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold">Lock round</button>}
            </ConfirmPopover>}
              <ConfirmPopover message={`Start Round ${artwork.round + 1}?`} detail="Comments open again. Anything still open carries over." confirmLabel={`Start Round ${artwork.round + 1}`} onConfirm={() => run(() => startDesignRound(artwork.id, artwork.round))}>
                {(o) => <button type="button" disabled={pending} onClick={o} className="rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-elevated">Start Round {artwork.round + 1}</button>}
              </ConfirmPopover>
          </div>
          <div className="mt-2 space-y-2">
            {versions.length > 1 && <DesignRevisionCompare key={artwork.round} id={artwork.id} versions={versions} />}
            <ReviewGroupInvite key={artwork.round} disabled={locked} send={(ids) => sendDesignReviewGroup(artwork.id, artwork.round, ids)} />
            <ReviewSentHistory load={() => designReviewSentHistory(artwork.id)} />
          </div>
          {current.length ? threadList(current) : <p className="mt-2 text-xs text-muted">No comments in this round.</p>}
          {previous.length > 0 && <details onToggle={(event) => setShowPrevious(event.currentTarget.open)} className="mt-2 text-xs">
            <summary className="cursor-pointer font-semibold">Previous rounds · {previous.length} threads</summary>{threadList(previous)}
          </details>}
          </>}
        </section>
      </aside>
    </div>
  );
}
