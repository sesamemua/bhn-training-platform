"use client";

/**
 * Anchored comments for the HTML script editor.
 *
 * The document lives in a Shadow DOM, where caret-from-a-point doesn't reach
 * the text reliably across browsers — so placement uses the NATIVE selection
 * (which works inside a shadow contentEditable): select a sentence or some
 * words in the script, click "Make comment", and the comment anchors to that
 * range (snapped to whole words; a bare click anchors the whole sentence).
 *
 * Renders highlight rectangles over the anchored text, margin comment cards to
 * the right of the document, and a thin loosely-dotted connector from each
 * anchor to its card (routed through the margin so it never crosses text).
 * Cards show who + when, support inline edit (tracked as "edited Nx"), threaded
 * replies, resolve/reopen, and admin delete, with an "updated Nx · last …"
 * line once a thread changes more than once. Everything except the button is
 * portaled to <body> at fixed viewport coords so it tracks the document on
 * scroll without fighting the editor layout.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, Check, RotateCcw, Trash2, Pencil, CornerDownRight, X } from "lucide-react";

interface Cmt {
  id: string; body: string; authorName: string; authorKind: string; status: string; parentId: string | null;
  anchorSectionId: string | null; anchorFrom: number | null; anchorTo: number | null; anchorQuote: string | null;
  editCount: number; editedAt: string | null; createdAt: string;
}
interface Draft { sid: string; from: number; to: number; quote: string }

const CARD_W = 264;

/* ── text helpers ─────────────────────────────────────────────────────── */
// Smallest text-homogeneous blocks we anchor to (a paragraph/heading/li), so
// offsets never span unrelated text and word-snapping can't bleed across
// siblings. Ordered small→large; closest() still returns the nearest match.
const BLOCK_SEL = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,figcaption,.script-copy,.speaker,.visual-note,.intercut-row,.box,section,article,div";

/** Character offset of a DOM point within block.textContent — Range-based, so
 *  it's correct whether `node` is a text node OR an element (selection
 *  endpoints land on elements after double/triple-click and at boundaries; the
 *  old text-only walk mismapped those to the block's full length). */
function charOffsetIn(block: HTMLElement, node: Node, offset: number): number {
  if (!block.contains(node) && node !== block) return -1;
  const probe = document.createRange();
  try { probe.selectNodeContents(block); probe.setEnd(node, offset); } catch { return (block.textContent ?? "").length; }
  return probe.toString().length;
}

/** Smallest block element containing `node` (paragraph/li/heading/…), never the
 *  whole section or root. */
function nearestBlock(node: Node, content: HTMLElement): HTMLElement | null {
  const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  if (!el || !content.contains(el)) return null;
  const b = el.closest(BLOCK_SEL) as HTMLElement | null;
  if (b && b !== content && content.contains(b)) return b;
  let top: HTMLElement | null = el;
  while (top && top.parentElement && top.parentElement !== content && content.contains(top.parentElement)) top = top.parentElement;
  return top && top !== content ? top : null;
}
function charToPoint(block: HTMLElement, target: number): { node: Node; offset: number } | null {
  let n = 0; let last: Node | null = null;
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let t: Node | null;
  while ((t = w.nextNode())) {
    const len = (t.textContent ?? "").length;
    if (target <= n + len) return { node: t, offset: Math.max(0, target - n) };
    n += len; last = t;
  }
  return last ? { node: last, offset: (last.textContent ?? "").length } : null;
}
function sentenceBounds(text: string, off: number): [number, number] {
  const marks = [0]; const re = /[.!?]+[)\]"']*\s+/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push(m.index + m[0].length);
  if (marks[marks.length - 1] !== text.length) marks.push(text.length);
  for (let i = 0; i < marks.length - 1; i++) if (off >= marks[i]! && off < marks[i + 1]!) {
    let s = marks[i]!, e = marks[i + 1]!;
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    return [s, e];
  }
  return [0, text.length];
}
function snapToWords(text: string, from: number, to: number): [number, number] {
  let s = from, e = to;
  while (s > 0 && /\S/.test(text[s - 1]!)) s--;
  while (e < text.length && /\S/.test(text[e]!)) e++;
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return [s, e];
}
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 24) return h + "h ago";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
/** Is this element inside a tab (.doc-panel) that isn't being viewed? */
export function inHiddenTab(el: Element | null | undefined): boolean {
  const panel = el?.closest(".doc-panel");
  return !!panel && !panel.classList.contains("active");
}

export function ScriptCommentLayer({
  contentRef, base, tabKey = null,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  base: string;
  /** Tabbed doc: the tab being viewed — only its comments show. */
  tabKey?: string | null;
}) {
  const [comments, setComments] = useState<Cmt[]>([]);
  const [canModerate, setCanModerate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [, force] = useState(0);
  // Coalesce all position recomputes (scroll / resize / every keystroke) into a
  // single update per animation frame — measuring ranges with getClientRects on
  // every raw event forced a reflow per event and felt sluggish.
  const rafRef = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; force((n) => n + 1); });
  }, []);

  // Locate the anchored block. If the sid is gone (e.g. the doc wasn't saved
  // before a reload), relocate by the stored quote so the comment survives.
  const blockFor = (sid: string | null, quote?: string | null): HTMLElement | null => {
    const content = contentRef.current; if (!content || !sid) return null;
    let el: HTMLElement | null = null;
    try { el = content.querySelector<HTMLElement>(`[data-sid="${CSS.escape(sid)}"]`); } catch { el = null; }
    if (el) return el;
    if (quote) for (const b of content.querySelectorAll<HTMLElement>(BLOCK_SEL)) if ((b.textContent ?? "").includes(quote)) return b;
    return null;
  };

  const rangeFor = useCallback((sid: string, from: number, to: number, quote: string | null): Range | null => {
    const block = blockFor(sid, quote); if (!block) return null;
    const text = block.textContent ?? "";
    let f = from, t = to;
    if (quote && text.slice(f, t) !== quote) {
      // Relocate to the occurrence nearest the stored offset (not just the
      // first), so a duplicated phrase or a small edit doesn't jump the anchor.
      let best = -1, bestD = Infinity, idx = text.indexOf(quote);
      while (idx >= 0) { const d = Math.abs(idx - from); if (d < bestD) { bestD = d; best = idx; } idx = text.indexOf(quote, idx + 1); }
      if (best < 0) return null;
      f = best; t = best + quote.length;
    }
    const a = charToPoint(block, f), b = charToPoint(block, t);
    if (!a || !b) return null;
    const r = document.createRange();
    try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch { return null; }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef]);

  const load = useCallback(async () => {
    const res = await fetch(`${base}/comments`).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { ok?: boolean; comments?: Cmt[]; canModerate?: boolean };
    if (j?.ok && Array.isArray(j.comments)) { setComments(j.comments); setCanModerate(!!j.canModerate); }
  }, [base]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onMove = () => schedule();
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    const el = contentRef.current;
    const mo = el ? new MutationObserver(onMove) : null;
    if (el) mo!.observe(el, { subtree: true, characterData: true, childList: true });
    const iv = setInterval(onMove, 5000); // keep relative times fresh
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      mo?.disconnect();
      clearInterval(iv);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [contentRef, schedule]);

  // Re-render when the in-document selection changes, so the floating
  // "Comment" button can follow it.
  useEffect(() => {
    const el = contentRef.current;
    const onSel = () => schedule();
    document.addEventListener("selectionchange", onSel);
    el?.addEventListener("mouseup", onSel);
    el?.addEventListener("keyup", onSel);
    return () => { document.removeEventListener("selectionchange", onSel); el?.removeEventListener("mouseup", onSel); el?.removeEventListener("keyup", onSel); };
  }, [contentRef, schedule]);

  /** Position rect for the floating button — the LAST client rect of the
   *  selection (where the user finished dragging), not the union box whose
   *  right edge is the widest line. */
  function readSel(): DOMRect | null {
    const content = contentRef.current; if (!content) return null;
    const root = content.getRootNode() as ShadowRoot;
    const sel: Selection | null = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.()
      ?? window.getSelection?.() ?? null;
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed || (!content.contains(range.startContainer) && !content.contains(range.endContainer))) return null;
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    return last && (last.width || last.height) ? last : null;
  }

  /* ── placement from the native selection ───────────────────────────── */
  function makeFromSelection() {
    const content = contentRef.current; if (!content) return;
    const root = content.getRootNode() as ShadowRoot;
    const sel: Selection | null = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.()
      ?? window.getSelection?.() ?? null;
    if (!sel || sel.rangeCount === 0) { hint("Select some text in the script first."); return; }
    const range = sel.getRangeAt(0);
    if (!content.contains(range.startContainer) && !content.contains(range.endContainer)) { hint("Select inside the script text."); return; }
    // Anchor to the smallest block that contains the WHOLE selection, so offsets
    // stay within one text-homogeneous block — works for headings, list items,
    // nested <strong>, and cross-paragraph drags alike. If that block has no
    // sid yet, tag it (and mark the doc dirty so the sid persists on save).
    const block = nearestBlock(range.commonAncestorContainer, content) ?? nearestBlock(range.startContainer, content);
    if (!block) { hint("Select inside a paragraph."); return; }
    let sid = block.getAttribute("data-sid");
    if (!sid) {
      sid = "c" + Math.random().toString(36).slice(2, 9);
      block.setAttribute("data-sid", sid);
      content.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const text = block.textContent ?? "";
    // Element-aware offsets (Range-based); clamp to the block when an endpoint
    // sits outside it (a drag that started or ended beyond the doc).
    const o1 = block.contains(range.startContainer) ? charOffsetIn(block, range.startContainer, range.startOffset) : 0;
    const o2 = block.contains(range.endContainer) ? charOffsetIn(block, range.endContainer, range.endOffset) : text.length;
    let from = Math.min(o1, o2), to = Math.max(o1, o2);
    if (range.collapsed || to === from) { [from, to] = sentenceBounds(text, from); }
    else { [from, to] = snapToWords(text, from, to); }
    if (to <= from || !text.slice(from, to).trim()) { hint("Select a word or sentence to comment on."); return; }
    setDraft({ sid, from, to, quote: text.slice(from, to) });
    setDraftBody(""); setSelectedId(null); setNotice(null);
    sel.removeAllRanges?.();
  }
  function hint(msg: string) { setNotice(msg); setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500); }

  /* ── mutations ─────────────────────────────────────────────────────── */
  async function saveDraft() {
    if (!draft || !draftBody.trim()) return;
    await fetch(`${base}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draftBody.trim(), anchorSectionId: draft.sid, anchorFrom: draft.from, anchorTo: draft.to, anchorQuote: draft.quote }),
    }).catch(() => {});
    setDraft(null); setDraftBody(""); await load();
  }
  async function resolve(c: Cmt) {
    const status = c.status === "resolved" ? "open" : "resolved";
    setComments((cur) => cur.map((x) => (x.id === c.id ? { ...x, status } : x)));
    await fetch(`${base}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: c.id, status }) }).catch(() => {});
  }
  async function saveEdit(c: Cmt) {
    if (!editBody.trim() || editBody.trim() === c.body) { setEditingId(null); return; }
    await fetch(`${base}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commentId: c.id, body: editBody.trim() }) }).catch(() => {});
    setEditingId(null); await load();
  }
  async function sendReply(parentId: string) {
    if (!replyBody.trim()) return;
    await fetch(`${base}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: replyBody.trim(), parentId }) }).catch(() => {});
    setReplyBody(""); setReplyFor(null); await load();
  }
  async function del(c: Cmt) {
    if (!confirm("Delete this comment?")) return;
    setComments((cur) => cur.filter((x) => x.id !== c.id && x.parentId !== c.id));
    await fetch(`${base}/comments?commentId=${c.id}`, { method: "DELETE" }).catch(() => {});
  }

  /* ── geometry ──────────────────────────────────────────────────────── */
  const content = contentRef.current;
  const docRect = content?.getBoundingClientRect();
  // Comments anchored in another tab stay with that tab (tabKey re-renders
  // this on a switch). Ones whose anchor is lost still show everywhere.
  const tops = comments.filter((c) => !c.parentId && !(tabKey && inHiddenTab(blockFor(c.anchorSectionId, c.anchorQuote))));
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const modCount = (c: Cmt) => c.editCount + repliesOf(c.id).length;
  const lastActivity = (c: Cmt) => {
    let at = c.createdAt, by = c.authorName;
    if (c.editedAt && c.editedAt > at) { at = c.editedAt; by = c.authorName; }
    for (const r of repliesOf(c.id)) if (r.createdAt > at) { at = r.createdAt; by = r.authorName; }
    return { at, by };
  };

  type Placed = { key: string; cmt?: Cmt; isDraft?: boolean; anchored: boolean; anchorY: number; anchorRight: number; rects: DOMRect[]; cardTop: number };
  const placed: Placed[] = [];
  const railLeft = docRect ? Math.min(docRect.right + 30, window.innerWidth - CARD_W - 12) : 0;
  if (docRect) {
    type It = { key: string; cmt?: Cmt; isDraft?: boolean; sid: string | null; from: number | null; to: number | null; quote: string | null };
    // EVERY top-level comment gets an entry — including ones with no anchor —
    // so a comment is never silently dropped from the UI.
    const items: It[] = tops.map((c) => ({ key: c.id, cmt: c, sid: c.anchorSectionId, from: c.anchorFrom, to: c.anchorTo, quote: c.anchorQuote }));
    if (draft) items.push({ key: "draft", isDraft: true, sid: draft.sid, from: draft.from, to: draft.to, quote: draft.quote });
    const measured = items.map((it) => {
      const r = it.sid != null && it.from != null && it.to != null ? rangeFor(it.sid, it.from, it.to, it.quote) : null;
      const rects = r ? Array.from(r.getClientRects()) : [];
      return { it, rects, top: rects.length ? rects[0]!.top : Infinity };
    });
    const anchored = measured.filter((x) => x.rects.length).sort((a, b) => a.top - b.top);
    const orphans = measured.filter((x) => !x.rects.length);
    const H = (isDraft?: boolean) => (isDraft ? 92 : 124) + 10;
    // Orphans (anchor can't be located on the page — the doc was edited/unsaved
    // so the marked block lost its id, or the quoted text changed) pin to the
    // top of the rail so they ALWAYS show; they just have no highlight/connector.
    let cursor = docRect.top + 4;
    for (const { it } of orphans) {
      placed.push({ key: it.key, cmt: it.cmt, isDraft: it.isDraft, anchored: false, anchorY: 0, anchorRight: 0, rects: [], cardTop: cursor });
      cursor += H(it.isDraft);
    }
    // Anchored cards track their text, but can't rise into the orphan zone.
    for (const { it, rects } of anchored) {
      const cardTop = Math.max(rects[0]!.top, cursor);
      placed.push({ key: it.key, cmt: it.cmt, isDraft: it.isDraft, anchored: true, anchorY: (rects[0]!.top + rects[rects.length - 1]!.bottom) / 2, anchorRight: docRect.right, rects, cardTop });
      cursor = cardTop + H(it.isDraft);
    }
  }

  const overlay = docRect ? createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none" }}>
      {placed.map((p) => {
        const sel = p.isDraft || p.cmt?.id === selectedId;
        const resolved = p.cmt?.status === "resolved";
        return p.rects.map((r, i) => (
          <div key={p.key + ":" + i} style={{
            position: "fixed", left: r.left, top: r.top, width: r.width, height: r.height,
            background: resolved ? "rgba(120,130,140,.16)" : sel ? "rgba(18,110,55,.36)" : "rgba(18,110,55,.22)",
            borderRadius: 3,
          }} />
        ));
      })}
      <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {placed.map((p) => {
          if (!p.anchored) return null; // orphans have no on-page text to connect to
          const cy = p.cardTop + 18, gx = docRect.right + 14;
          const dim = p.cmt?.status === "resolved" ? 0.4 : 1;
          // Loose round dots routed entirely through the right gutter — they
          // start at the document's right edge, so the line NEVER crosses text.
          // Round caps + ~0-length dashes render as dots (a 1px dashed line
          // anti-aliases to nothing).
          return (
            <g key={"th" + p.key} opacity={dim}>
              <path d={`M ${p.anchorRight} ${p.anchorY} L ${gx} ${p.anchorY} L ${gx} ${cy} L ${railLeft} ${cy}`} fill="none" stroke="#5f6b7c" strokeWidth={2} strokeDasharray="0.1 6.5" strokeLinecap="round" />
              <circle cx={p.anchorRight} cy={p.anchorY} r={3.5} fill="#126e37" />
            </g>
          );
        })}
      </svg>
      {placed.map((p) => (
        <div key={"card" + p.key} style={{ position: "fixed", left: railLeft, top: p.cardTop, width: CARD_W, pointerEvents: "auto", zIndex: 61 }}>
          {p.isDraft ? (
            <div style={cardStyle(true)}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: "#126e37" }}>New comment</span>
                <button onClick={() => setDraft(null)} style={ico} title="Cancel"><X size={12} /></button>
              </div>
              <div style={quoteStyle}>“{draft?.quote}”</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input autoFocus value={draftBody} onChange={(e) => setDraftBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveDraft(); if (e.key === "Escape") setDraft(null); }}
                  placeholder="Comment on this…" style={inputStyle} />
                <button onClick={saveDraft} style={sendStyle}>Send</button>
              </div>
            </div>
          ) : p.cmt && (
            <CardBody
              c={p.cmt} sel={p.cmt.id === selectedId} canModerate={canModerate} unlinked={!p.anchored}
              replies={repliesOf(p.cmt.id)} modCount={modCount(p.cmt)} last={lastActivity(p.cmt)}
              editing={editingId === p.cmt.id} editBody={editBody} setEditBody={setEditBody}
              replyOpen={replyFor === p.cmt.id} replyBody={replyBody} setReplyBody={setReplyBody}
              onSelect={() => setSelectedId(p.cmt!.id)}
              onResolve={() => resolve(p.cmt!)} onDelete={() => del(p.cmt!)}
              onEditStart={() => { setEditingId(p.cmt!.id); setEditBody(p.cmt!.body); }}
              onEditSave={() => saveEdit(p.cmt!)} onEditCancel={() => setEditingId(null)}
              onReplyOpen={() => { setReplyFor(p.cmt!.id); setReplyBody(""); }}
              onReplySend={() => sendReply(p.cmt!.id)}
            />
          )}
        </div>
      ))}
    </div>,
    document.body,
  ) : null;

  // Floating "Comment" button that sits on the document beside the selection.
  const selRect = !draft ? readSel() : null;
  const floatBtn = selRect ? createPortal(
    <button onMouseDown={(e) => e.preventDefault()} onClick={makeFromSelection}
      style={{
        position: "fixed",
        left: Math.min(selRect.right - 6, window.innerWidth - 122),
        top: selRect.top - 38 > 8 ? selRect.top - 38 : selRect.bottom + 6,
        zIndex: 65, display: "inline-flex", alignItems: "center", gap: 6,
        background: "#126e37", color: "#fff", border: 0, borderRadius: 8, padding: "6px 11px",
        fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px -6px rgba(0,0,0,.45)",
      }}>
      <MessageSquarePlus size={13} /> Comment
    </button>, document.body) : null;

  return (
    <div className="rounded-xl border border-line bg-card-solid p-3">
      <p className="text-[11px] leading-relaxed text-muted">
        <b>Select text</b> in the script — a <b>Comment</b> button appears beside it. Comments show in the margin, linked by a dotted line; click a card to highlight what it marks.
      </p>
      {notice && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800">{notice}</p>}
      {tops.length > 0 && <p className="mt-2 text-[11px] text-subtle">{tops.filter((c) => c.status !== "resolved").length} open · {tops.length} total</p>}
      {overlay}
      {floatBtn}
    </div>
  );
}

/* ── presentational card ──────────────────────────────────────────────── */
const cardStyle = (draft?: boolean): React.CSSProperties => ({
  background: "var(--card-solid)", border: `1px solid ${draft ? "#126e37" : "var(--line-strong, #cfd6df)"}`,
  borderRadius: 10, boxShadow: "0 6px 18px -8px rgba(0,0,0,.3)", padding: "9px 10px",
});
const quoteStyle: React.CSSProperties = { fontSize: 11, color: "var(--fg-muted)", borderLeft: "2px solid var(--line)", paddingLeft: 7, marginBottom: 6, fontStyle: "italic", maxHeight: 32, overflow: "hidden" };
const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, border: "1px solid var(--line)", borderRadius: 7, padding: "5px 8px", fontSize: 12.5, color: "var(--fg)", background: "var(--elevated)", outline: "none" };
const sendStyle: React.CSSProperties = { flex: "none", background: "#126e37", color: "#fff", border: 0, borderRadius: 7, padding: "5px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" };
const ico: React.CSSProperties = { width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, color: "var(--fg-muted)", cursor: "pointer", border: 0, background: "transparent" };

function CardBody(props: {
  c: Cmt; sel: boolean; canModerate: boolean; unlinked?: boolean; replies: Cmt[]; modCount: number; last: { at: string; by: string };
  editing: boolean; editBody: string; setEditBody: (v: string) => void;
  replyOpen: boolean; replyBody: string; setReplyBody: (v: string) => void;
  onSelect: () => void; onResolve: () => void; onDelete: () => void;
  onEditStart: () => void; onEditSave: () => void; onEditCancel: () => void;
  onReplyOpen: () => void; onReplySend: () => void;
}) {
  const { c } = props;
  return (
    <div style={{ ...cardStyle(), opacity: c.status === "resolved" ? 0.62 : 1, outline: props.sel ? "1px solid #126e37" : "none" }} onClick={props.onSelect}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>{c.authorName}</span>
        {c.authorKind === "anon" && <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-subtle)", background: "var(--elevated)", padding: "1px 5px", borderRadius: 4 }}>guest</span>}
        <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{relTime(c.createdAt)}</span>
        <button title="Edit" style={ico} onClick={(e) => { e.stopPropagation(); props.onEditStart(); }}><Pencil size={12} /></button>
        <button title={c.status === "resolved" ? "Reopen" : "Resolve"} style={ico} onClick={(e) => { e.stopPropagation(); props.onResolve(); }}>{c.status === "resolved" ? <RotateCcw size={12} /> : <Check size={12} />}</button>
        {props.canModerate && <button title="Delete" style={ico} onClick={(e) => { e.stopPropagation(); props.onDelete(); }}><Trash2 size={12} /></button>}
      </div>
      {c.anchorQuote && <div style={quoteStyle}>“{c.anchorQuote}”</div>}
      {props.unlinked && <div style={{ fontSize: 10.5, color: "var(--fg-subtle)", fontStyle: "italic", margin: "0 0 5px" }}>↡ shown here — its text wasn’t found on the page</div>}
      {props.editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input autoFocus value={props.editBody} onChange={(e) => props.setEditBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") props.onEditSave(); if (e.key === "Escape") props.onEditCancel(); }} style={inputStyle} />
          <button onClick={(e) => { e.stopPropagation(); props.onEditSave(); }} style={sendStyle}>Save</button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--fg)", whiteSpace: "pre-wrap", wordBreak: "break-word", textDecoration: c.status === "resolved" ? "line-through" : "none" }}>
          {c.body}{c.editCount > 0 && <span style={{ fontSize: 11, color: "var(--fg-subtle)", fontStyle: "italic", marginLeft: 4 }}>edited{c.editCount > 1 ? ` ${c.editCount}×` : ""}</span>}
        </div>
      )}
      {props.replies.map((r) => (
        <div key={r.id} style={{ marginTop: 7, paddingTop: 7, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg)" }}>{r.authorName}</span>
            <span style={{ fontSize: 10.5, color: "var(--fg-subtle)" }}>{relTime(r.createdAt)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--fg)", marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.body}</div>
        </div>
      ))}
      {props.replyOpen ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input autoFocus value={props.replyBody} onChange={(e) => props.setReplyBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") props.onReplySend(); if (e.key === "Escape") props.onReplyOpen(); }} placeholder="Reply…" style={inputStyle} />
          <button onClick={(e) => { e.stopPropagation(); props.onReplySend(); }} style={sendStyle}>Reply</button>
        </div>
      ) : (
        <button onClick={(e) => { e.stopPropagation(); props.onReplyOpen(); }} style={{ ...ico, width: "auto", gap: 4, marginTop: 7, fontSize: 11, padding: "0 4px" }}><CornerDownRight size={11} /> Reply</button>
      )}
      {props.modCount > 1 && (
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px dashed var(--line)", fontSize: 11, color: "var(--fg-muted)" }}>
          ↻ updated {props.modCount}× · last {relTime(props.last.at)} by {props.last.by}
        </div>
      )}
    </div>
  );
}
