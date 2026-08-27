"use client";

/**
 * Paste the newsletter code, render it, and let people leave notes on it.
 *
 * The same job the Review frame above does for the issue this app
 * generated, but for the HTML that comes back OUT of Mailchimp — which
 * is the thing actually being signed off, since Mailchimp rewrites
 * links and wraps the fragment.
 *
 * THE FRAME: sandbox="allow-same-origin", and deliberately NOT
 * allow-scripts.
 *
 * That combination is the whole reason this can exist. allow-same-origin
 * keeps the frame on this origin, so the parent can reach
 * contentDocument and attach a click layer — which is what pins a note
 * to an element. Omitting allow-scripts means nothing inside executes:
 * not <script>, not an inline onerror, not a javascript: URL. Verified
 * in a browser rather than assumed.
 *
 * So this is strictly safer than the unsandboxed frame the issue review
 * uses, while doing more than the read-only sandboxed preview it
 * replaces — that one could not be commented on precisely because
 * nothing can reach into a frame with an opaque origin.
 *
 * Scripts are stripped from the markup as well. Belt and braces: the
 * frame already cannot run them, and email clients strip them too, so
 * removing them keeps the preview honest about what recipients see.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, ClipboardPaste, Crosshair, Loader2, Trash2, TriangleAlert, X,
} from "lucide-react";

interface Note {
  id: string;
  body: string;
  status: string;
  anchorQuote: string | null;
  anchorLabel: string | null;
  cssPath: string | null;
  anchorState: string;
  authorName: string;
}

interface Review {
  id: string; title: string; code: string; round: number; status: string; notes: Note[];
}

const API = "/api/workspace/code-review";

/** The frame cannot run these anyway; removing them keeps the preview
 *  honest about what an email client will show. */
function stripScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "");
}

/** A short, stable-ish path from the body, as a fallback anchor. */
function pathOf(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== "BODY" && parts.length < 8) {
    const parent: Element | null = node.parentElement;
    const idx = parent ? Array.from(parent.children).indexOf(node) + 1 : 1;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${idx})`);
    node = parent;
  }
  return parts.join(" > ");
}

export function PastedNewsletterReview({ initial }: { initial: Review | null }) {
  const [review, setReview] = useState<Review | null>(initial);
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ quote: string; label: string; path: string } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const reload = useCallback(async (id: string) => {
    const r = await fetch(`${API}?id=${encodeURIComponent(id)}`);
    const j = await r.json().catch(() => ({}));
    if (j?.review) setReview(j.review as Review);
  }, []);

  const call = useCallback(async (method: string, payload: unknown, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(API, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "That didn't work."); return null; }
      return j;
    } finally { setBusy(null); }
  }, []);

  /*
   * The click layer, attached to the frame's own document. Possible
   * only because allow-same-origin is set; safe only because
   * allow-scripts is not.
   */
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc || !review) return;

    const onClick = (e: MouseEvent) => {
      if (!picking) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as Element | null;
      if (!el || !el.tagName) return;
      setPending({
        quote: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        label: el.getAttribute("data-nl-part") ?? el.tagName.toLowerCase(),
        path: pathOf(el),
      });
      setPicking(false);
    };

    doc.addEventListener("click", onClick, true);
    doc.body?.style.setProperty("cursor", picking ? "crosshair" : "auto");
    return () => {
      doc.removeEventListener("click", onClick, true);
      doc.body?.style.removeProperty("cursor");
    };
  }, [picking, review]);

  async function start() {
    const j = await call("POST", { title, code: paste }, "start");
    if (j?.id) { setPaste(""); setTitle(""); await reload(j.id as string); }
  }

  async function addNote() {
    if (!review || !pending || !draft.trim()) return;
    const j = await call("PATCH", {
      action: "addNote", reviewId: review.id, body: draft,
      anchorQuote: pending.quote, anchorLabel: pending.label, cssPath: pending.path,
    }, "add");
    if (j) { setDraft(""); setPending(null); await reload(review.id); }
  }

  async function setStatus(noteId: string, status: string) {
    if (!review) return;
    if (await call("PATCH", { action: "setNoteStatus", noteId, status }, `st-${noteId}`)) {
      await reload(review.id);
    }
  }

  async function removeNote(noteId: string) {
    if (!review) return;
    await fetch(`${API}?noteId=${encodeURIComponent(noteId)}`, { method: "DELETE" }).catch(() => {});
    await reload(review.id);
  }

  /** Scroll the frame to a note's element and flash it. */
  function showMe(n: Note) {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    let el: Element | null = null;
    if (n.anchorQuote) {
      el = Array.from(doc.body?.querySelectorAll("*") ?? []).find(
        (x) => (x.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300) === n.anchorQuote
          && x.children.length === 0,
      ) ?? null;
    }
    if (!el && n.cssPath) { try { el = doc.body?.querySelector(n.cssPath) ?? null; } catch { el = null; } }
    if (!el) { setError("That element isn't in this version of the paste."); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prev = (el as HTMLElement).style.outline;
    (el as HTMLElement).style.outline = "3px solid #f59e0b";
    setTimeout(() => { (el as HTMLElement).style.outline = prev; }, 1600);
  }

  const shown = (review?.notes ?? []).filter((n) => showResolved || n.status === "open");
  const openCount = (review?.notes ?? []).filter((n) => n.status === "open").length;

  if (!review) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardPaste size={14} className="text-brand-600" />
          <h2 className="text-sm font-bold text-fg">Review a paste</h2>
        </div>
        <p className="text-[12px] leading-relaxed text-muted">
          Paste the HTML that comes back out of Mailchimp. It renders below, and anyone
          on the team can click any part of it to leave a note — the same way the issue
          above is reviewed. Nothing in the paste runs.
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this? e.g. September issue, out of Mailchimp"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
        />
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={6}
          placeholder="Paste the HTML here…"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-brand-500"
        />
        {error && <p className="text-[12px] text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={busy === "start" || !paste.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === "start" ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
          Render it for review
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <ClipboardPaste size={14} className="text-brand-600" />
        <h2 className="text-sm font-bold text-fg truncate">{review.title}</h2>
        <span className="text-[11.5px] text-muted">
          {openCount} {openCount === 1 ? "note" : "notes"} open
        </span>
        <button
          onClick={() => setPicking((v) => !v)}
          className={
            "ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition " +
            (picking ? "bg-amber-500 text-white" : "border border-line text-fg hover:bg-elevated")
          }
        >
          <Crosshair size={12} /> {picking ? "Click any part of it…" : "Leave a note"}
        </button>
        <button
          onClick={() => setReview(null)}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"
        >
          New paste
        </button>
      </header>

      <p className="flex items-start gap-1.5 bg-amber-50 px-4 py-2 text-[11.5px] leading-snug text-amber-900">
        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
        Rendered with scripts disabled — nothing in the paste can run. Email clients strip
        them too, so this is close to what recipients see.
      </p>

      {pending && (
        <div className="border-b border-line bg-brand-50/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-800">
            Note on {pending.label}
          </p>
          {pending.quote && (
            <p className="mt-0.5 line-clamp-2 text-[11.5px] italic text-muted">“{pending.quote}”</p>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="What needs changing?"
            className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={addNote}
              disabled={!draft.trim() || busy === "add"}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Add note
            </button>
            <button
              onClick={() => { setPending(null); setDraft(""); }}
              className="text-[12px] font-semibold text-muted hover:text-fg"
            >
              <X size={11} className="inline" /> Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="px-4 py-2 text-[12px] text-red-600">{error}</p>}

      <iframe
        ref={frameRef}
        title="Pasted newsletter"
        /* allow-same-origin WITHOUT allow-scripts: the parent can reach
           the document to attach the click layer, and nothing inside
           can execute. Adding allow-scripts here would run a campaign
           export's JavaScript on this origin. */
        sandbox="allow-same-origin"
        srcDoc={stripScripts(review.code)}
        className="h-[70vh] w-full border-0 bg-white"
      />

      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-bold text-fg">
            Notes {shown.length > 0 && <span className="text-muted">({shown.length})</span>}
          </h3>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="size-3.5 accent-brand-600"
            />
            Show resolved
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted">
            Nothing yet. Press <span className="font-semibold text-fg">Leave a note</span> and
            click any part of the newsletter above.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {shown.map((n) => (
              <li key={n.id} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-elevated px-2 py-0.5 text-[10.5px] font-semibold text-fg-subtle">
                    {n.anchorLabel ?? "element"}
                  </span>
                  {n.status === "resolved" && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                      resolved
                    </span>
                  )}
                  <button
                    onClick={() => showMe(n)}
                    className="ml-auto text-[11.5px] font-semibold text-brand-700 hover:text-brand-900"
                  >
                    Show me where
                  </button>
                </div>
                {n.anchorQuote && (
                  <p className="mt-1 line-clamp-1 text-[11px] italic text-muted">“{n.anchorQuote}”</p>
                )}
                <p className="mt-1 text-[12.5px] leading-relaxed text-fg">{n.body}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <span className="font-semibold">{n.authorName}</span>
                  <button
                    onClick={() => setStatus(n.id, n.status === "resolved" ? "open" : "resolved")}
                    className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-brand-700"
                  >
                    <Check size={11} /> {n.status === "resolved" ? "Reopen" : "Resolve"}
                  </button>
                  <button onClick={() => removeNote(n.id)} className="hover:text-red-600">
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
