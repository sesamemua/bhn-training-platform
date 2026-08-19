"use client";
/**
 * Newsletter workshop.
 *
 * Left: four drop-boxes, one per section — a colleague pastes whatever
 * they have and hits Add. No formatting rules, no fields to fill in.
 * Right: the assembled issue. "Lay out with AI" normalises every new
 * contribution and renders the Mailchimp fragment, which the editor
 * copies straight into a Mailchimp Code block.
 */
import { useState } from "react";
import {
  Loader2, Plus, Sparkles, Trash2, ArrowUp, ArrowDown, Copy, Check, Pencil,
  Link2, Mail,
} from "lucide-react";
import { SECTIONS, SECTION_THEME } from "@/lib/newsletter/types";
import type { Section } from "@/lib/newsletter/types";

interface Piece {
  id: string; section: string; position: number; rawBody: string;
  sourceUrl: string | null; authorName: string | null; status: string;
}
interface Issue {
  id: string; title: string; dateline: string; status: string;
  renderedHtml: string | null; renderedAt: string | null; pieces: Piece[];
}

export function NewsletterClient({ initialIssue, canEdit }: { initialIssue: Issue; canEdit: boolean }) {
  /** Piece currently open for editing, with its working copy. A
   *  contribution used to be final the moment it was added — the only
   *  way to fix a typo was to delete it and retype the whole thing. */
  const [editing, setEditing] = useState<{ id: string; body: string; url: string } | null>(null);
  const [issue, setIssue] = useState<Issue>(initialIssue);
  const [drafts, setDrafts] = useState<Record<string, { body: string; url: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const draftFor = (s: Section) => drafts[s] ?? { body: "", url: "" };

  async function post(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(`/api/workspace/newsletter/${issue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error ?? "That didn't work."); return null; }
      if (j.issue) setIssue(j.issue as Issue);
      return j;
    } finally { setBusy(null); }
  }

  async function add(s: Section) {
    const d = draftFor(s);
    if (d.body.trim().length < 10) { setError("Give us a sentence or two at least."); return; }
    const j = await post({ action: "addPiece", section: s, rawBody: d.body.trim(), sourceUrl: d.url.trim() }, `add-${s}`);
    if (j) setDrafts((c) => ({ ...c, [s]: { body: "", url: "" } }));
  }

  async function generate() {
    const j = await post({ action: "generate" }, "gen");
    if (j?.html) setIssue((c) => ({ ...c, renderedHtml: j.html as string }));
  }

  async function copyHtml() {
    if (!issue.renderedHtml) return;
    try {
      await navigator.clipboard.writeText(issue.renderedHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Couldn't reach the clipboard — select the code and copy manually."); }
  }

  const staleSince = issue.renderedAt
    ? issue.pieces.some((p) => p.status !== "normalised")
    : false;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Drop boxes ────────────────────────────────── */}
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const t = SECTION_THEME[s];
            const mine = issue.pieces.filter((p) => p.section === s);
            const d = draftFor(s);
            return (
              <section key={s} className="rounded-2xl border border-line bg-card overflow-hidden">
                <header
                  className="px-4 py-3 flex items-baseline gap-2 flex-wrap"
                  style={{ background: t.ribbon }}
                >
                  <h3 className="text-white font-bold tracking-wide text-sm">{t.label}</h3>
                  <span className="text-white/80 text-[11px]">{t.tagline}</span>
                  <span className="ml-auto text-white/90 text-[11px] font-mono tabular-nums">
                    {mine.length} {mine.length === 1 ? "piece" : "pieces"}
                  </span>
                </header>

                <div className="p-4 space-y-2">
                  {mine.map((p, i) => (
                    <div key={p.id} className="rounded-lg bg-elevated/60 ring-1 ring-inset ring-line px-3 py-2">
                      {editing?.id === p.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editing.body}
                            autoFocus
                            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                            rows={5}
                            className="w-full resize-y rounded-md border border-line bg-card-solid px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-brand-400"
                          />
                          <input
                            value={editing.url}
                            onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                            placeholder="Source link (optional)"
                            className="w-full rounded-md border border-line bg-card-solid px-2.5 py-1.5 text-[12px] text-fg outline-none focus:border-brand-400"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditing(null)}
                              className="rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-fg hover:border-line-strong"
                            >
                              Cancel
                            </button>
                            <button
                              disabled={!!busy || editing.body.trim().length < 10}
                              onClick={async () => {
                                const ok = await post(
                                  {
                                    action: "updatePiece",
                                    pieceId: p.id,
                                    rawBody: editing.body.trim(),
                                    sourceUrl: editing.url.trim(),
                                  },
                                  p.id,
                                );
                                if (ok) setEditing(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1 text-[12px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {busy === p.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[13px] text-fg leading-snug whitespace-pre-wrap">{p.rawBody}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {p.authorName && <span className="text-[10px] text-subtle">{p.authorName}</span>}
                        {p.sourceUrl && (
                          <span className="text-[10px] text-brand-700 inline-flex items-center gap-0.5">
                            <Link2 size={9} /> link
                          </span>
                        )}
                        {canEdit && (
                          <span className="ml-auto inline-flex items-center gap-1">
                            <button aria-label="Move up" disabled={i === 0 || !!busy}
                              onClick={() => post({ action: "movePiece", pieceId: p.id, direction: "up" }, p.id)}
                              className="p-1 rounded hover:bg-raised disabled:opacity-30"><ArrowUp size={12} /></button>
                            <button aria-label="Move down" disabled={i === mine.length - 1 || !!busy}
                              onClick={() => post({ action: "movePiece", pieceId: p.id, direction: "down" }, p.id)}
                              className="p-1 rounded hover:bg-raised disabled:opacity-30"><ArrowDown size={12} /></button>
                            <button aria-label="Edit" disabled={!!busy}
                              onClick={() => setEditing({ id: p.id, body: p.rawBody, url: p.sourceUrl ?? "" })}
                              className="p-1 rounded hover:bg-raised disabled:opacity-30"><Pencil size={12} /></button>
                            <button aria-label="Remove" disabled={!!busy}
                              onClick={() => post({ action: "deletePiece", pieceId: p.id }, p.id)}
                              className="p-1 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-30"><Trash2 size={12} /></button>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  <textarea
                    value={d.body}
                    onChange={(e) => setDrafts((c) => ({ ...c, [s]: { ...d, body: e.target.value } }))}
                    rows={3}
                    placeholder={`Paste anything for ${t.label} — a paragraph, bullets, a forwarded note.`}
                    className="w-full text-sm bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <input
                      value={d.url}
                      onChange={(e) => setDrafts((c) => ({ ...c, [s]: { ...d, url: e.target.value } }))}
                      placeholder="Link for the button (optional)"
                      className="flex-1 min-w-[180px] text-xs bg-card border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                    <button
                      onClick={() => add(s)}
                      disabled={busy === `add-${s}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy === `add-${s}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {/* ── Output ────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-line bg-card p-5">
            <h3 className="text-base font-bold text-fg inline-flex items-center gap-2">
              <Mail size={15} className="text-brand-600" /> {issue.title}
            </h3>
            <p className="text-sm text-muted mt-1">
              {issue.pieces.length} {issue.pieces.length === 1 ? "contribution" : "contributions"} ·{" "}
              {issue.renderedAt ? `last laid out ${new Date(issue.renderedAt).toLocaleString()}` : "not laid out yet"}
            </p>
            {staleSince && (
              <p className="text-xs text-amber-700 mt-2">New contributions since the last layout — re-run it.</p>
            )}
            {canEdit && (
              <div className="flex gap-2 mt-4 flex-wrap">
                <button
                  onClick={generate}
                  disabled={busy === "gen" || issue.pieces.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 disabled:opacity-60 shadow-md shadow-brand-600/25"
                >
                  {busy === "gen" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {busy === "gen" ? "Laying out…" : "Lay out with AI"}
                </button>
                {issue.renderedHtml && (
                  <button
                    onClick={copyHtml}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card ring-1 ring-inset ring-line text-fg font-bold text-sm hover:bg-elevated"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy Mailchimp HTML"}
                  </button>
                )}
              </div>
            )}
          </section>

          {issue.renderedHtml && (
            <section className="rounded-2xl border border-line bg-card overflow-hidden">
              <header className="px-4 py-2.5 border-b border-line/70">
                <h4 className="text-xs font-bold uppercase tracking-wider text-subtle">Preview</h4>
              </header>
              <iframe
                title="Newsletter preview"
                srcDoc={`<meta charset="utf-8"><body style="margin:0;background:#f4f4f4">${issue.renderedHtml}</body>`}
                className="w-full h-[640px] bg-white"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
