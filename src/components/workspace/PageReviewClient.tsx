"use client";
/**
 * Website review.
 *
 * Left: the threads on this page, grouped by the element each is anchored
 * to. Anyone instructor+ can add a thread, reply, edit their own, resolve.
 * Right: the export brief — Markdown for Claude Code / Codex.
 */
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Plus, MessageSquarePlus, Check, Trash2, Pencil, Copy, Lock, RotateCcw,
  FileDown, ExternalLink, AlertTriangle, ArrowRight, CornerDownRight, X,
} from "lucide-react";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Comment {
  id: string; parentId: string | null; round: number;
  anchorQuote: string | null; anchorKey: string | null;
  anchorPath: string | null; anchorBlock: string | null; anchorState: string;
  authorUserId: string | null; authorName: string; authorKind: string; body: string;
  status: string; editCount: number; editedAt: string | null;
  editedByName: string | null; createdAt: string;
}
interface Review {
  id: string; url: string; title: string; status: string; round: number;
  comments: Comment[];
}

/**
 * A textarea that matches the amount of text in it, so a long comment isn't
 * typed through a three-line window. Height is cleared before measuring
 * because scrollHeight only ever grows while an explicit height is set —
 * without the reset, deleting text would leave the box tall. Past max-h-64
 * it scrolls rather than pushing the buttons off screen.
 */
function AutoTextarea({ value, className, ...rest }: ComponentPropsWithoutRef<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} value={value} className={`${className ?? ""} max-h-64 overflow-y-auto`} {...rest} />;
}

/**
 * Any reviewer can edit any comment, so a bare "edited" would leave the
 * author's name standing over someone else's wording. Name the editor when
 * it wasn't the author. Comments edited before this was recorded have no
 * editor and fall back to "· edited".
 */
function editedLabel(c: Comment): string {
  if (!c.editedByName || c.editedByName === c.authorName) return "· edited";
  return `· edited by ${c.editedByName}`;
}

export function PageReviewClient({
  initialReview, meId, isAdmin,
}: { initialReview: Review; meId: string | null; isAdmin: boolean }) {
  const router = useRouter();
  const { confirmDialog, node: confirmNode } = useConfirmDialog();
  const [review, setReview] = useState<Review>(initialReview);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [newC, setNewC] = useState({ quote: "", body: "" });
  /**
   * Which round's threads to show. Defaults to the current one — the list
   * used to render every comment ever filed, so a page on Round 3 opened
   * showing 41 resolved items from Rounds 1 and 2 and nothing current. The
   * live-page overlay has always shown just the current round; this is what
   * brings the two surfaces into line. Earlier rounds stay reachable.
   */
  const [roundView, setRoundView] = useState<number | "all">(initialReview.round);

  async function post(payload: Record<string, unknown>, key: string) {
    setBusy(key); setError(null);
    try {
      const r = await fetch(`/api/workspace/page-review/${review.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "That didn't work."); return null; }
      if (j.review) setReview(j.review as Review);
      return j;
    } finally { setBusy(null); }
  }

  const tops = review.comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => review.comments.filter((c) => c.parentId === id);

  /**
   * The one definition of "still needs doing", and it deliberately says
   * nothing about rounds. A comment reopened after a page revision is rolled
   * back keeps the round it was raised in, so anything that equates
   * outstanding with the current round under-reports the work — that mistake
   * has now been made on five separate surfaces, each time presenting as
   * someone's feedback silently disappearing. buildBrief filters on exactly
   * this, so these counts and the export always agree.
   */
  const openTops = tops.filter((c) => c.status === "open");
  const shownTops = roundView === "all" ? tops : openTops;
  // Mirrors the server's guard: this round's comments plus anything still
  // outstanding from an earlier one, so a round of carried-over work doesn't
  // leave "Start Round N+1" greyed out.
  const currentRoundCommentCount = review.comments.filter(
    (c) => c.round === review.round || c.status === "open",
  ).length;
  // Exporting hands the round to whoever is making the changes; it stays
  // frozen so the brief they are working from can't move under them.
  const locked = review.status !== "open";

  async function addThread() {
    if (newC.body.trim().length < 2) { setError("Say a little more."); return; }
    const j = await post({
      action: "addComment", body: newC.body.trim(),
      anchorQuote: newC.quote.trim() || null,
    }, "new");
    if (j) setNewC({ quote: "", body: "" });
  }

  /**
   * Any reviewer can delete any comment. Deleting your own is unremarkable,
   * so it goes straight through; deleting someone else's asks first, and
   * says whose it is and how many replies go with it — a top-level comment
   * takes its whole thread, which may be other people's words.
   */
  async function removeComment(
    commentId: string,
    authorName: string,
    mine: boolean,
    replyCount: number,
  ) {
    if (!mine) {
      const thread =
        replyCount > 0
          ? ` Its ${replyCount} ${replyCount === 1 ? "reply goes" : "replies go"} with it.`
          : "";
      const ok = await confirmDialog({
        title: `Delete ${authorName}'s comment?`,
        description: `${thread} This can't be undone.`.trim(),
        confirmLabel: "Delete comment",
        cancelLabel: "Keep it",
        tone: "destructive",
      });
      if (!ok) return;
    }
    await post({ action: "deleteComment", commentId }, commentId);
  }

  async function copyBrief() {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true); window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Couldn't reach the clipboard — select the text and copy manually."); }
  }

  async function deleteReview() {
    const commentCount = review.comments.length;
    const ok = await confirmDialog({
      title: `Delete “${review.title}”?`,
      description: `This permanently deletes the review session and ${commentCount} comment${commentCount === 1 ? "" : "s"}. Its shared review link will stop working. This can't be undone.`,
      confirmLabel: "Delete review",
      cancelLabel: "Keep review",
      tone: "destructive",
    });
    if (!ok) return;

    setBusy("delete-review");
    setError(null);
    try {
      const response = await fetch(`/api/workspace/page-review/${review.id}`, {
        method: "DELETE",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        setError(result?.error ?? "Couldn't delete that review.");
        return;
      }
      router.replace("/admin/workspace/website-review");
      router.refresh();
    } catch {
      setError("Couldn't reach the platform. Try again.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Reverting a page revision makes everything that round settled outstanding
   * again. Bulk because doing it one comment at a time across ten items is
   * how people give up and re-type them.
   */
  async function reopenRound(round: number, count: number) {
    const ok = await confirmDialog({
      title: `Reopen Round ${round}?`,
      description:
        `${count} settled ${count === 1 ? "item" : "items"} from Round ${round} will be marked outstanding again and will appear in the next brief. ` +
        `They stay recorded as Round ${round} — this changes their state, not their history.`,
      confirmLabel: `Reopen ${count}`,
      cancelLabel: "Leave settled",
      tone: "warning",
    });
    if (!ok) return;
    await post({ action: "reopenRound", round }, `reopen-${round}`);
  }

  async function startNextRound() {
    // No "from Round N": outstanding items can have been carried over from
    // an earlier one, and advancing settles all of them.
    const openLine = openTops.length > 0
      ? `${openTops.length} outstanding item${openTops.length === 1 ? "" : "s"} will be marked resolved. `
      : "";
    const ok = await confirmDialog({
      title: `Start Round ${review.round + 1}?`,
      description: `${openLine}New feedback will be recorded under Round ${review.round + 1}. Existing comments remain in the session history.`,
      confirmLabel: `Start Round ${review.round + 1}`,
      cancelLabel: `Stay in Round ${review.round}`,
      tone: "warning",
    });
    if (!ok) return;

    const result = await post({ action: "startNextRound" }, "next-round");
    if (result) {
      setBrief(null);
      // Follow the review forward, or the list would keep showing the round
      // that was just closed — the exact confusion this filter fixes.
      const next = (result.review as { round?: number } | undefined)?.round;
      setRoundView(typeof next === "number" ? next : review.round + 1);
    }
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-900">{error}</div>}

      {locked && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
          <p className="text-sm font-bold text-amber-900 inline-flex items-center gap-1.5">
            <Lock size={13} /> Round {review.round} is locked
          </p>
          <p className="text-xs text-amber-800 mt-1 leading-relaxed">
            {review.status === "closed"
              ? "This review is closed. Its comments are kept for reference."
              : `It was exported, so the brief someone is working from stays exactly what you signed off. Comments reopen when you start Round ${review.round + 1}.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Threads ─────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {!locked && (
          <section className="rounded-2xl border border-line bg-card p-4">
            <h3 className="text-sm font-bold text-fg inline-flex items-center gap-2">
              <MessageSquarePlus size={14} className="text-brand-600" /> New comment
            </h3>
            <input
              value={newC.quote}
              onChange={(e) => setNewC((c) => ({ ...c, quote: e.target.value }))}
              placeholder="Paste the text on the page you're commenting on (optional but recommended)"
              className="mt-3 w-full text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <AutoTextarea
              value={newC.body}
              onChange={(e) => setNewC((c) => ({ ...c, body: e.target.value }))}
              rows={3}
              placeholder="What should change, and why?"
              className="mt-2 w-full text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
            />
            <button
              onClick={addThread} disabled={busy === "new"}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
            >
              {busy === "new" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add comment
            </button>
          </section>
          )}

          {tops.length > openTops.length && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-semibold text-subtle">Showing</span>
              <div className="inline-flex rounded-lg bg-elevated p-0.5 ring-1 ring-inset ring-line">
                <button
                  type="button"
                  onClick={() => setRoundView(review.round)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    roundView !== "all" ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  Outstanding ({openTops.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRoundView("all")}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    roundView === "all" ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  All rounds ({tops.length})
                </button>
              </div>
              <span className="text-[11px] text-subtle">
                {tops.length - openTops.length} settled
              </span>
            </div>
          )}

          {isAdmin && roundView === "all" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-elevated/60 px-3 py-2">
              <span className="text-[11px] font-semibold text-muted">
                Reverted a revision on the live page?
              </span>
              {[...new Set(tops.map((c) => c.round))]
                .sort((a, b) => b - a)
                .map((rd) => {
                  const settled = tops.filter((c) => c.round === rd && c.status !== "open").length;
                  if (settled === 0) return null;
                  return (
                    <button
                      key={rd}
                      onClick={() => reopenRound(rd, settled)}
                      disabled={busy !== null || locked}
                      className="inline-flex items-center gap-1 rounded-lg bg-card px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {busy === `reopen-${rd}` ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Reopen Round {rd} ({settled})
                    </button>
                  );
                })}
            </div>
          )}

          {shownTops.length === 0 && (
            <p className="text-sm text-muted px-1">
              {tops.length === 0
                ? "No comments yet. Add the first one above."
                : "Nothing outstanding — everything is settled. Earlier rounds are under “All rounds”."}
            </p>
          )}

          {shownTops.map((c) => {
            const mine = c.authorUserId && c.authorUserId === meId;
            const resolved = c.status !== "open";
            return (
              <article
                key={c.id}
                className={`rounded-2xl border bg-card overflow-hidden ${resolved ? "border-line opacity-60" : "border-line"}`}
              >
                {(c.anchorQuote || c.anchorKey) && (
                  <div className="px-4 pt-3 pb-2 bg-elevated/50 border-b border-line/70">
                    {c.anchorQuote && (
                      <p className="text-[13px] text-fg italic leading-snug">&ldquo;{c.anchorQuote}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {c.anchorKey && <code className="text-[10px] text-subtle">{c.anchorKey}</code>}
                      {c.anchorState === "orphaned" && (
                        <span className="text-[10px] text-amber-700 inline-flex items-center gap-1">
                          <AlertTriangle size={9} /> anchor not found
                        </span>
                      )}
                      <span className={`ml-auto text-[10px] font-mono ${c.round === review.round ? "text-subtle" : "text-amber-700"}`}>
                        round {c.round}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-fg">{c.authorName}</span>
                    {c.authorKind === "anon" && (
                      <span className="rounded bg-elevated px-1 text-[9px] uppercase tracking-wide text-subtle">
                        guest
                      </span>
                    )}
                    <span className="text-[10px] text-subtle">{new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.editCount > 0 && <span className="text-[10px] text-subtle">{editedLabel(c)}</span>}
                    {resolved && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded-full">
                        {c.status}
                      </span>
                    )}
                  </div>

                  {editing === c.id ? (
                    <div className="mt-2">
                      <AutoTextarea
                        value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3}
                        className="w-full text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                      />
                      <div className="flex gap-2 mt-1.5">
                        <button
                          onClick={async () => {
                            await post({ action: "editComment", commentId: c.id, body: editBody }, c.id);
                            setEditing(null);
                          }}
                          className="text-xs font-bold text-brand-700 hover:text-brand-900">Save</button>
                        <button onClick={() => setEditing(null)} className="text-xs text-subtle hover:text-fg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-fg mt-1 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  )}

                  {/* replies */}
                  {repliesOf(c.id).map((r) => (
                    <div key={r.id} className="mt-3 pl-3 border-l-2 border-line">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <CornerDownRight size={10} className="text-subtle" />
                        <span className="text-[12px] font-semibold text-fg">{r.authorName}</span>
                        {r.authorKind === "anon" && (
                          <span className="rounded bg-elevated px-1 text-[9px] uppercase tracking-wide text-subtle">
                            guest
                          </span>
                        )}
                        {r.editCount > 0 && <span className="text-[10px] text-subtle">{editedLabel(r)}</span>}
                        {!locked && (
                        <span className="ml-auto inline-flex gap-1">
                          <button aria-label="Edit reply" onClick={() => { setEditing(r.id); setEditBody(r.body); }}
                            className="p-1 rounded hover:bg-raised"><Pencil size={10} /></button>
                          <button aria-label="Delete reply"
                            onClick={() => removeComment(r.id, r.authorName, r.authorUserId === meId, 0)}
                            className="p-1 rounded hover:bg-rose-50 text-rose-600"><Trash2 size={10} /></button>
                        </span>
                        )}
                      </div>
                      {editing === r.id ? (
                        <div className="mt-1">
                          <AutoTextarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2}
                            className="w-full text-[13px] bg-card border border-line rounded-lg px-2 py-1.5 resize-y" />
                          <div className="flex gap-2 mt-1">
                            <button onClick={async () => { await post({ action: "editComment", commentId: r.id, body: editBody }, r.id); setEditing(null); }}
                              className="text-[11px] font-bold text-brand-700">Save</button>
                            <button onClick={() => setEditing(null)} className="text-[11px] text-subtle">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-muted mt-0.5 leading-relaxed whitespace-pre-wrap">{r.body}</p>
                      )}
                    </div>
                  ))}

                  {/* actions — a locked round is read-only */}
                  {!locked && (
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {replyTo === c.id ? (
                      <div className="w-full">
                        <AutoTextarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={2}
                          placeholder="Reply…" className="w-full text-[13px] bg-card border border-line rounded-lg px-2 py-1.5 resize-y" />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={async () => {
                              const j = await post({ action: "addComment", body: replyBody, parentId: c.id }, `r-${c.id}`);
                              if (j) { setReplyBody(""); setReplyTo(null); }
                            }}
                            className="text-[11px] font-bold text-brand-700">Post reply</button>
                          <button onClick={() => setReplyTo(null)} className="text-[11px] text-subtle inline-flex items-center gap-0.5"><X size={9} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReplyTo(c.id); setReplyBody(""); }}
                        className="text-xs font-semibold text-brand-700 hover:text-brand-900">Reply</button>
                    )}
                    {!resolved ? (
                      <button onClick={() => post({ action: "setStatus", commentId: c.id, status: "resolved" }, c.id)}
                        className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"><Check size={11} /> Resolve</button>
                    ) : (
                      <button
                        onClick={() => post({ action: "reopenComment", commentId: c.id }, c.id)}
                        title={
                          c.round === review.round
                            ? "Mark this outstanding again"
                            : `Raised in Round ${c.round}. Reopening puts it back in the brief without moving it out of that round.`
                        }
                        className="text-xs font-semibold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
                      >
                        <RotateCcw size={11} /> Reopen
                      </button>
                    )}
                    <button onClick={() => { setEditing(c.id); setEditBody(c.body); }}
                      className="text-xs text-subtle hover:text-fg inline-flex items-center gap-1"><Pencil size={11} /> Edit</button>
                    {/* Delete is open to every reviewer, not just the author —
                        a review is a shared workspace. Edit stays author-only:
                        removing a comment is tidying, rewording someone else's
                        puts words in their mouth. */}
                    <button
                      onClick={() => removeComment(c.id, c.authorName, !!mine, repliesOf(c.id).length)}
                      className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* ── Brief ───────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h3 className="text-base font-bold text-fg">{review.title}</h3>
            <a href={review.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 mt-1 break-all">
              {review.url} <ExternalLink size={10} className="shrink-0" />
            </a>
            <p className="text-sm text-muted mt-2">
              Round {review.round} · {openTops.length} open · {tops.length} total
            </p>
            {isAdmin && (
              <div className="flex gap-2 mt-4 flex-wrap">
                <button
                  onClick={async () => { const j = await post({ action: "export" }, "exp"); if (j?.brief) setBrief(j.brief as string); }}
                  disabled={busy !== null || openTops.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy === "exp" ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Export brief
                </button>
                {brief && (
                  <button onClick={copyBrief}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card ring-1 ring-inset ring-line text-fg font-bold text-sm hover:bg-elevated">
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={startNextRound}
                  disabled={busy !== null || currentRoundCommentCount === 0}
                  className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-elevated ring-1 ring-inset ring-line text-fg font-semibold text-sm hover:bg-raised disabled:opacity-60"
                >
                  {busy === "next-round" ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  Start Round {review.round + 1}
                </button>
                <button
                  type="button"
                  onClick={deleteReview}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl ring-1 ring-inset ring-rose-200 text-rose-700 font-semibold text-sm hover:bg-rose-50 disabled:opacity-60"
                >
                  {busy === "delete-review" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Delete review
                </button>
              </div>
            )}
            <p className="text-[11px] text-subtle mt-3 leading-relaxed">
              Export the current round as often as needed. Start the next round after its revisions are applied.
            </p>
          </section>

          {brief && (
            <section className="rounded-2xl border border-line bg-card overflow-hidden">
              <header className="px-4 py-2.5 border-b border-line/70">
                <h4 className="text-xs font-bold uppercase tracking-wider text-subtle">Brief for Claude Code / Codex</h4>
              </header>
              <pre className="p-4 text-[11.5px] leading-relaxed font-mono text-fg whitespace-pre-wrap max-h-[520px] overflow-auto">{brief}</pre>
            </section>
          )}
        </div>
      </div>
      {confirmNode}
    </div>
  );
}
