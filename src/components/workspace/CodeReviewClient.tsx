"use client";

/**
 * Review a block of pasted code: click a line, leave a note.
 *
 * The code is rendered as TEXT — every line is a React text child, so
 * it is escaped by the framework and never parsed as markup. That is
 * the whole reason this tab can take a paste from anybody's campaign
 * export and still let notes pin to it: the sibling PastedHtmlReview
 * has to sandbox its frame precisely because it renders, and nothing
 * can reach into a sandboxed frame to attach a click layer. Reading
 * the source instead of the render sidesteps that entirely.
 *
 * There is no syntax highlighting, and that is deliberate rather than
 * unfinished: every highlighter here would want dangerouslySetInnerHTML
 * on the pasted string, which is the one thing this must not do.
 */
import { useCallback, useMemo, useState } from "react";
import {
  Check, ClipboardPaste, Loader2, MessageSquarePlus, Trash2, TriangleAlert, X,
} from "lucide-react";
import { splitLines, type MatchKind } from "@/lib/codereview/anchor";

interface Note {
  id: string;
  round: number;
  body: string;
  status: string;
  anchorText: string;
  anchorLine: number;
  anchorState: string;
  authorName: string;
  located?: { line: number | null; kind: MatchKind };
}

interface Review {
  id: string; title: string; kind: string; code: string;
  round: number; status: string; lines: number; notes: Note[];
}

/** What each match outcome means, in the reviewer's language. */
const STATE_NOTE: Partial<Record<MatchKind, string>> = {
  moved: "This line moved since the note was written.",
  ambiguous: "Several lines look identical — this is a best guess.",
  loose: "The line was edited slightly; matched on its wording.",
  orphaned: "This line is no longer in the paste.",
};

export function CodeReviewClient({ initial }: { initial: Review | null }) {
  const [review, setReview] = useState<Review | null>(initial);
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const API = "/api/workspace/code-review";

  const call = useCallback(async (method: string, payload: unknown, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(API, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "That didn't work."); return null; }
      return j;
    } finally { setBusy(null); }
  }, []);

  const reload = useCallback(async (id: string) => {
    const r = await fetch(`${API}?id=${encodeURIComponent(id)}`);
    const j = await r.json().catch(() => ({}));
    if (j?.review) setReview(j.review as Review);
  }, []);

  async function start() {
    const j = await call("POST", { title, code: paste, kind: guessKind(paste) }, "start");
    if (j?.id) { setPaste(""); setTitle(""); await reload(j.id as string); }
  }

  async function replaceCode() {
    if (!review) return;
    const j = await call("PUT", { id: review.id, code: paste }, "replace");
    if (j) { setPaste(""); await reload(review.id); }
  }

  async function addNote(line: number) {
    if (!review || !draft.trim()) return;
    const j = await call("PATCH", { action: "addNote", reviewId: review.id, line, body: draft }, `note-${line}`);
    if (j) { setDraft(""); setOpenLine(null); await reload(review.id); }
  }

  async function setStatus(noteId: string, status: string) {
    if (!review) return;
    const j = await call("PATCH", { action: "setNoteStatus", noteId, status }, `st-${noteId}`);
    if (j) await reload(review.id);
  }

  async function removeNote(noteId: string) {
    if (!review) return;
    setBusy(`del-${noteId}`);
    await fetch(`${API}?noteId=${encodeURIComponent(noteId)}`, { method: "DELETE" }).catch(() => {});
    setBusy(null);
    await reload(review.id);
  }

  const lines = useMemo(() => (review ? splitLines(review.code) : []), [review]);

  /** Notes that found a home, indexed by the line they landed on. */
  const byLine = useMemo(() => {
    const m = new Map<number, Note[]>();
    for (const n of review?.notes ?? []) {
      if (n.status === "resolved" && !showResolved) continue;
      const l = n.located?.line;
      if (l == null) continue;
      m.set(l, [...(m.get(l) ?? []), n]);
    }
    return m;
  }, [review, showResolved]);

  const orphans = (review?.notes ?? []).filter(
    (n) => n.located?.line == null && (showResolved || n.status !== "resolved"),
  );
  const openCount = (review?.notes ?? []).filter((n) => n.status === "open").length;

  /* ── Nothing pasted yet ──────────────────────────────────────── */
  if (!review) {
    return (
      <section className="rounded-2xl border border-line bg-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-fg">Review a block of code</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
            Paste HTML, JSON or anything else and leave notes on individual lines. It is
            shown as text and never run, so a campaign export is safe to paste here.
          </p>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is this? e.g. September issue, out of Mailchimp"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-fg outline-none focus:border-brand-500"
        />
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={10}
          placeholder="Paste the code here…"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none focus:border-brand-500"
        />
        {error && <p className="text-[12px] text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={busy === "start" || !paste.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy === "start" ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
          Start reviewing
        </button>
      </section>
    );
  }

  /* ── Reviewing ───────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-fg truncate">{review.title}</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {review.lines.toLocaleString()} lines · round {review.round} ·{" "}
              {openCount} {openCount === 1 ? "note" : "notes"} open
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="size-3.5 accent-brand-600"
              />
              Show resolved
            </label>
            <button
              onClick={() => setReview(null)}
              className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-fg hover:bg-elevated"
            >
              New paste
            </button>
          </div>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-semibold text-brand-700">
            Paste a newer version
          </summary>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            Notes are kept and re-found by the text of the line they were written on. One
            whose line has gone is listed separately rather than moved somewhere it does
            not belong.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder="Paste the updated code…"
            className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] text-fg outline-none focus:border-brand-500"
          />
          <button
            onClick={replaceCode}
            disabled={busy === "replace" || !paste.trim()}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === "replace" ? <Loader2 size={12} className="animate-spin" /> : null}
            Replace and re-anchor
          </button>
        </details>

        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      </section>

      {orphans.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-amber-900">
            <TriangleAlert size={13} />
            {orphans.length} {orphans.length === 1 ? "note has" : "notes have"} lost their line
          </p>
          <p className="mt-0.5 text-[11.5px] text-amber-800">
            The line each was written on is no longer in the paste. They are kept here
            rather than pinned to whatever is nearest.
          </p>
          <ul className="mt-2 space-y-2">
            {orphans.map((n) => (
              <li key={n.id} className="rounded-lg bg-white/70 p-2">
                <p className="font-mono text-[11px] text-amber-900 break-all">{n.anchorText}</p>
                <p className="mt-1 text-[12px] text-slate-800">{n.body}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{n.authorName}</span>
                  <button onClick={() => removeNote(n.id)} className="ml-auto hover:text-red-600">
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-card overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse font-mono text-[12px] leading-[1.55]">
            <tbody>
              {lines.map((text, i) => {
                const n = i + 1;
                const here = byLine.get(n) ?? [];
                const active = openLine === n;
                return (
                  <tr key={n} className={here.length > 0 ? "bg-brand-50/60" : undefined}>
                    <td
                      onClick={() => { setOpenLine(active ? null : n); setDraft(""); }}
                      className="w-14 select-none border-r border-line px-2 text-right align-top text-[11px] text-muted cursor-pointer hover:bg-elevated hover:text-brand-700"
                      title="Leave a note on this line"
                    >
                      {n}
                    </td>
                    <td className="px-3 align-top">
                      {/* Text child: escaped by React, never parsed as markup. */}
                      <pre className="whitespace-pre-wrap break-all text-fg m-0 font-mono">{text}</pre>

                      {here.map((note) => (
                        <div key={note.id} className="my-1.5 rounded-lg border border-line bg-card p-2 font-sans">
                          <p className="text-[12px] leading-relaxed text-fg">{note.body}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                            <span className="font-semibold">{note.authorName}</span>
                            {note.status === "resolved" && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                                resolved
                              </span>
                            )}
                            {note.located && STATE_NOTE[note.located.kind] && (
                              <span className="text-amber-700">{STATE_NOTE[note.located.kind]}</span>
                            )}
                            <button
                              onClick={() => setStatus(note.id, note.status === "resolved" ? "open" : "resolved")}
                              disabled={busy === `st-${note.id}`}
                              className="ml-auto inline-flex items-center gap-1 font-semibold hover:text-brand-700"
                            >
                              <Check size={11} /> {note.status === "resolved" ? "Reopen" : "Resolve"}
                            </button>
                            <button onClick={() => removeNote(note.id)} className="hover:text-red-600">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {active && (
                        <div className="my-1.5 rounded-lg border border-brand-300 bg-brand-50/60 p-2 font-sans">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder={`Note on line ${n}…`}
                            className="w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12px] text-fg outline-none focus:border-brand-500"
                          />
                          <div className="mt-1.5 flex items-center gap-2">
                            <button
                              onClick={() => addNote(n)}
                              disabled={!draft.trim() || busy === `note-${n}`}
                              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1 text-[11.5px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              <MessageSquarePlus size={11} /> Add note
                            </button>
                            <button
                              onClick={() => setOpenLine(null)}
                              className="text-[11.5px] font-semibold text-muted hover:text-fg"
                            >
                              <X size={11} className="inline" /> Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** A guess, used only to label the paste. It changes nothing about how
 *  the text is handled — it is never parsed either way. */
function guessKind(code: string): "html" | "json" | "text" {
  const t = code.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (/<[a-z!][\s\S]*>/i.test(t)) return "html";
  return "text";
}
