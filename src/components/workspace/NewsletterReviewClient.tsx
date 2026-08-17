"use client";

/**
 * Newsletter review — point at an element, leave a note.
 *
 * The rendered issue goes into a same-origin iframe (no sandbox, exactly
 * as the Compose preview already does) and this component reaches in to
 * attach a click layer. Clicking any anchored element captures:
 *
 *   • the piece id           (`data-nl-piece`)  — survives a regenerate
 *   • the part label         (`data-nl-part`)   — "Headline", "Paragraph 2"
 *   • the element's own text (the quote)        — how a note finds its
 *                                                 way home if the layout
 *                                                 shifts underneath it
 *
 * Anchoring by piece + quote rather than a CSS path is the whole point:
 * the newsletter HTML is REGENERATED every time the AI layout re-runs, so
 * a structural selector would break on every generate, while the piece
 * keeps its id and the wording usually keeps its text.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  MessageSquarePlus,
  MousePointerClick,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

interface Comment {
  id: string;
  pieceId: string | null;
  anchorQuote: string | null;
  anchorLabel: string | null;
  body: string;
  status: string;
  authorName: string | null;
  editedByName: string | null;
  createdAt: string;
}

interface Draft {
  pieceId: string | null;
  anchorLabel: string | null;
  anchorQuote: string | null;
  cssPath: string | null;
}

export function NewsletterReviewClient({
  issueId,
  issueTitle,
  initialHtml,
  initialComments,
  unrendered,
}: {
  issueId: string;
  issueTitle: string;
  initialHtml: string;
  initialComments: Comment[];
  unrendered: number;
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const api = `/api/workspace/newsletter/${issueId}/comments`;

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      try {
        const res = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await res.json()) as { ok?: boolean; comments?: Comment[] };
        if (j.comments) setComments(j.comments);
        return j.ok === true;
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  /**
   * Attach the picker to the iframe document. Re-runs when `picking`
   * flips so the cursor and highlight follow the mode, and cleans up
   * after itself — an orphaned listener on a reloaded frame would fire
   * against a stale React closure.
   */
  useEffect(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;

    const STYLE_ID = "nl-review-style";
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .nl-pickable [data-nl-piece] { cursor: crosshair; }
        .nl-pickable [data-nl-piece]:hover {
          outline: 2px solid #016e8f;
          outline-offset: 3px;
          background-color: rgba(1,110,143,0.06);
        }
        [data-nl-commented] {
          outline: 2px dashed #f59e0b;
          outline-offset: 3px;
        }
        [data-nl-flash] {
          outline: 3px solid #016e8f !important;
          outline-offset: 4px;
        }
      `;
      doc.head?.appendChild(style);
    }
    doc.body?.classList.toggle("nl-pickable", picking);

    if (!picking) return;

    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-nl-piece]") as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const quote = (target.textContent ?? "").trim().slice(0, 400);
      setDraft({
        pieceId: target.getAttribute("data-nl-piece"),
        anchorLabel: target.getAttribute("data-nl-part"),
        anchorQuote: quote || null,
        cssPath: target.tagName.toLowerCase(),
      });
      setBody("");
    };

    doc.addEventListener("click", onClick, true);
    return () => {
      doc.removeEventListener("click", onClick, true);
      doc.body?.classList.remove("nl-pickable");
    };
  }, [picking, initialHtml]);

  /** Dash every element that already carries a note. */
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("[data-nl-commented]").forEach((el) =>
      el.removeAttribute("data-nl-commented"),
    );
    const open = comments.filter((c) => c.status === "open" && c.pieceId);
    for (const c of open) {
      const sel = `[data-nl-piece="${CSS.escape(c.pieceId!)}"]`;
      const nodes = Array.from(doc.querySelectorAll(sel));
      // Prefer the element whose part label matches; fall back to the
      // first node of the piece so a note is never orphaned on screen.
      const hit =
        nodes.find((n) => n.getAttribute("data-nl-part") === c.anchorLabel) ?? nodes[0];
      hit?.setAttribute("data-nl-commented", "1");
    }
  }, [comments, initialHtml]);

  /** Scroll the iframe to a comment's element and flash it. */
  const locate = (c: Comment) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !c.pieceId) return;
    const nodes = Array.from(doc.querySelectorAll(`[data-nl-piece="${CSS.escape(c.pieceId)}"]`));
    const hit =
      nodes.find((n) => n.getAttribute("data-nl-part") === c.anchorLabel) ?? nodes[0];
    if (!hit) return;
    hit.scrollIntoView({ behavior: "smooth", block: "center" });
    hit.setAttribute("data-nl-flash", "1");
    setTimeout(() => hit.removeAttribute("data-nl-flash"), 1200);
  };

  const submit = async () => {
    if (!body.trim()) return;
    const ok = await send({
      action: "add",
      body: body.trim(),
      pieceId: draft?.pieceId ?? null,
      anchorQuote: draft?.anchorQuote ?? null,
      anchorLabel: draft?.anchorLabel ?? null,
      cssPath: draft?.cssPath ?? null,
    });
    if (ok) {
      setBody("");
      setDraft(null);
    }
  };

  const open = comments.filter((c) => c.status === "open");
  const resolved = comments.filter((c) => c.status === "resolved");
  const shown = showResolved ? comments : open;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      {/* ── the issue ────────────────────────────────────────────── */}
      <section className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <p className="text-[13px] text-muted">
            {picking ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-brand-700">
                <MousePointerClick size={13} />
                Click any headline, subhead or paragraph to pin a note
              </span>
            ) : (
              "Pinning is off — the preview behaves normally."
            )}
          </p>
          <button
            onClick={() => setPicking((v) => !v)}
            className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-fg"
          >
            {picking ? "Stop pinning" : "Start pinning"}
          </button>
        </div>

        {unrendered > 0 && (
          <p className="mb-3 rounded-lg border border-line bg-elevated px-4 py-2.5 text-[12.5px] text-muted">
            {unrendered} contribution{unrendered === 1 ? " has" : "s have"} not been
            laid out yet — shown as a placeholder. Run Generate on the Compose
            tab to lay {unrendered === 1 ? "it" : "them"} out.
          </p>
        )}

        <iframe
          ref={frameRef}
          title={`${issueTitle} preview`}
          srcDoc={initialHtml}
          className="h-[75vh] w-full rounded-xl border border-line bg-white"
        />
      </section>

      {/* ── notes ────────────────────────────────────────────────── */}
      <aside className="min-w-0 space-y-4">
        {draft && (
          <div className="rounded-xl border border-brand/40 bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">
                {draft.anchorLabel ?? "Element"}
              </p>
              <button
                onClick={() => setDraft(null)}
                className="text-subtle hover:text-fg"
                aria-label="Cancel note"
              >
                <X size={14} />
              </button>
            </div>
            {draft.anchorQuote && (
              <p className="mt-1.5 line-clamp-3 border-l-2 border-line pl-2.5 text-[12.5px] italic leading-relaxed text-muted">
                {draft.anchorQuote}
              </p>
            )}
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="What needs changing?"
              className="mt-3 w-full resize-y rounded-md border border-line bg-elevated px-3 py-2 text-[13px] text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            />
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <MessageSquarePlus size={13} />}
              Add note
            </button>
          </div>
        )}

        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-bold text-fg">
            {open.length} open
            {resolved.length > 0 && (
              <span className="font-semibold text-subtle"> · {resolved.length} resolved</span>
            )}
          </h2>
          {resolved.length > 0 && (
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="text-[12px] font-semibold text-muted hover:text-fg"
            >
              {showResolved ? "Hide resolved" : "Show resolved"}
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
            No notes yet. Click something in the issue to leave the first one.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {shown.map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border border-line bg-card p-3.5 ${
                  c.status === "resolved" ? "opacity-60" : ""
                }`}
              >
                <button
                  onClick={() => locate(c)}
                  className="block w-full text-left"
                  title="Show me where"
                >
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-700">
                    {c.anchorLabel ?? "Whole issue"}
                  </p>
                  {c.anchorQuote && (
                    <p className="mt-1 line-clamp-2 border-l-2 border-line pl-2 text-[12px] italic text-subtle">
                      {c.anchorQuote}
                    </p>
                  )}
                </button>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">
                  {c.body}
                </p>
                <p className="mt-1.5 text-[11.5px] text-subtle">
                  {c.authorName ?? "Someone"}
                  {c.editedByName ? ` · edited by ${c.editedByName}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() =>
                      send({
                        action: "setStatus",
                        commentId: c.id,
                        status: c.status === "open" ? "resolved" : "open",
                      })
                    }
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-fg disabled:opacity-50"
                  >
                    {c.status === "open" ? <Check size={12} /> : <RotateCcw size={12} />}
                    {c.status === "open" ? "Resolve" : "Reopen"}
                  </button>
                  <button
                    onClick={() => send({ action: "delete", commentId: c.id })}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
