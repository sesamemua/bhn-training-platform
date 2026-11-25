"use client";
/**
 * Newsletter workshop.
 *
 * Left: one drop-box per section — a colleague pastes whatever
 * they have and hits Add. No formatting rules, no fields to fill in.
 * Right: the assembled issue. "Lay out with AI" normalises every new
 * contribution and renders the Mailchimp fragment, which the editor
 * copies straight into a Mailchimp Code block.
 */
import { useState } from "react";
import {
  Loader2, Plus, Sparkles, Trash2, ArrowUp, ArrowDown, Copy, Check, Pencil,
  ClipboardPaste, X,
  ChevronDown, FlaskConical, Link2, Mail,
} from "lucide-react";
import { SECTIONS, SECTION_THEME } from "@/lib/newsletter/types";
import type { NewsletterImage, Section } from "@/lib/newsletter/types";
import { NewsletterImages } from "./NewsletterImages";
import { NewsletterExperiments } from "./NewsletterExperiments";

interface Piece {
  id: string; section: string; position: number; rawBody: string;
  sourceUrl: string | null; authorName: string | null; status: string;
}
interface Issue {
  id: string; title: string; dateline: string; status: string;
  renderedHtml: string | null; renderedAt: string | null; pieces: Piece[];
  sectionImages?: Partial<Record<Section, NewsletterImage[]>>;
  imagesByPieceId?: Record<string, NewsletterImage[]>;
  preserveWording?: Partial<Record<Section, boolean>>;
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
  /** Pieces shown in full; the rest are clamped to three lines. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const layoutIsStale = !!issue.renderedHtml && (!issue.renderedAt
    || issue.pieces.some((p) => p.status !== "normalised" && p.status !== "excluded"
      && issue.preserveWording?.[p.section as Section] !== true));
  const hasContent = issue.pieces.length > 0 || Object.values(issue.sectionImages ?? {}).some((images) => images?.length);

  function updateImages(targetType: "section" | "piece", targetId: string, images: NewsletterImage[]) {
    setIssue((current) => targetType === "section"
      ? { ...current, renderedAt: null, sectionImages: { ...current.sectionImages, [targetId]: images } }
      : { ...current, renderedAt: null, imagesByPieceId: { ...current.imagesByPieceId, [targetId]: images } });
  }

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
    } catch {
      setError("Could not confirm the change. Reload to check the issue before trying again.");
      return null;
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

  /*
   * The hand-off. "Lay out with AI" uses the platform's model; this is
   * for an editor who would rather do that pass in their own tool —
   * copy the raw submissions out as a prompt, paste the answer back.
   */
  const [handoff, setHandoff] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [report, setReport] = useState<{
    applied: { id: string }[];
    missing: { id: string; section: string }[];
    unknown: string[];
    problems: string[];
    preserved?: { id: string; section: string }[];
  } | null>(null);

  async function copyBrief() {
    setError(null);
    const j = await post({ action: "aiBrief" }, "brief");
    if (!j?.brief) return;
    try {
      await navigator.clipboard.writeText(j.brief as string);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    } catch {
      setError("Couldn't reach the clipboard — the brief is below, select and copy it.");
    }
  }

  async function applyPaste() {
    if (!paste.trim()) return;
    setBusy("apply");
    setError(null);
    setReport(null);
    try {
      const r = await fetch(`/api/workspace/newsletter/${issue.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "aiApply", text: paste }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error ?? "That didn't work.");
        if (j?.report) setReport(j.report);
        return;
      }
      if (j.issue) setIssue(j.issue as Issue);
      setReport(j.report ?? null);
      setPaste("");
    } catch {
      setError("Could not confirm the layout change. Reload to check the issue before trying again.");
    } finally { setBusy(null); }
  }

  async function copyHtml() {
    if (!issue.renderedHtml || layoutIsStale || busy) return;
    try {
      await navigator.clipboard.writeText(issue.renderedHtml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Couldn't reach the clipboard — select the code and copy manually."); }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-900">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Drop boxes ────────────────────────────────── */}
        <div className="space-y-4">
          <p className="text-[11px] text-subtle">Pictures are public links — nothing confidential.</p>
          {SECTIONS.map((s) => {
            const t = SECTION_THEME[s];
            const mine = issue.pieces.filter((p) => p.section === s);
            const d = draftFor(s);
            return (
              <section key={s} className="rounded-2xl border border-line bg-card overflow-hidden">
                <header
                  title={t.brief}
                  className={`px-4 py-2.5 flex items-baseline gap-2 min-w-0 ${t.light ? "border-b border-line" : ""}`}
                  style={{ background: t.ribbon }}
                >
                  {/* The top story's band is pale, so its words are dark — the colours it will have in the email. */}
                  <h3 className="font-bold tracking-wide text-sm" style={{ color: t.light ? t.accent : "#ffffff" }}>{t.label}</h3>
                  <span className="min-w-0 truncate text-[11px]" style={{ color: t.light ? "#3a4a5c" : "rgba(255,255,255,0.8)" }}>{t.tagline}</span>
                  <span className="ml-auto text-[11px] font-mono tabular-nums" style={{ color: t.light ? "#3a4a5c" : "rgba(255,255,255,0.9)" }}>
                    {mine.length || ""}
                  </span>
                </header>

                <div className="p-3 space-y-2">
                  {canEdit && (
                    <div className="border-b border-line pb-3 mb-3" aria-busy={busy === `wording-${s}`}>
                      <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-fg">
                        <input
                          type="checkbox"
                          checked={issue.preserveWording?.[s] === true}
                          disabled={issue.status === "sent" || !!busy}
                          aria-label={`Keep wording as-is for ${t.label}`}
                          aria-describedby={`wording-help-${issue.id}-${s}`}
                          onChange={(e) => {
                            if (issue.status === "sent" || busy) return;
                            return post({ action: "setPreserveWording", section: s, preserveWording: e.currentTarget.checked }, `wording-${s}`);
                          }}
                          className="h-4 w-4 shrink-0 accent-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50"
                        />
                        Keep wording as-is
                      </label>
                      <span role="status" className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted">
                        {busy === `wording-${s}` && <><Loader2 size={11} className="animate-spin" aria-hidden="true" />Saving…</>}
                      </span>
                      <p id={`wording-help-${issue.id}-${s}`} className="mt-1 text-[11px] leading-relaxed text-subtle">
                        Saved text in this section is used exactly as submitted; AI will not rewrite it.
                      </p>
                    </div>
                  )}
                  <NewsletterImages issueId={issue.id} targetType="section" targetId={s} label={`${t.label} section`}
                    images={issue.sectionImages?.[s] ?? []} disabled={issue.status === "sent" || !!busy}
                    onChange={(images) => updateImages("section", s, images)}
                    onBusyChange={(pending) => setBusy(pending ? `images-section-${s}` : null)} />
                  {mine.map((p, i) => (
                    <div key={p.id} className="group rounded-lg bg-elevated/60 ring-1 ring-inset ring-line px-3 py-2 min-w-0">
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
                        <button
                          type="button"
                          onClick={() => setExpanded((cur) => { const n = new Set(cur); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                          aria-expanded={expanded.has(p.id)}
                          title={expanded.has(p.id) ? "Show less" : "Show all"}
                          className={`w-full text-left text-[13px] text-fg leading-snug whitespace-pre-wrap break-words ${expanded.has(p.id) ? "block" : "line-clamp-3"}`}
                        >
                          {p.rawBody}
                        </button>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 min-w-0">
                        <NewsletterImages issueId={issue.id} targetType="piece" targetId={p.id} label={`${t.label} item ${i + 1}`} size="sm"
                          images={issue.imagesByPieceId?.[p.id] ?? []} disabled={issue.status === "sent" || !!busy}
                          onChange={(images) => updateImages("piece", p.id, images)}
                          onBusyChange={(pending) => setBusy(pending ? `images-piece-${p.id}` : null)} />
                        {p.authorName && <span className="shrink-0 text-[10px] text-subtle">{p.authorName}</span>}
                        {p.sourceUrl && (
                          <a href={p.sourceUrl} target="_blank" rel="noreferrer" title={p.sourceUrl} aria-label="Source link"
                            className="shrink-0 text-brand-700 hover:text-brand-900"><Link2 size={11} /></a>
                        )}
                        {canEdit && (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
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
                    rows={d.body ? 3 : 1}
                    aria-label={`New ${t.label} item`}
                    placeholder="Paste text…"
                    className="w-full text-sm bg-card border border-line rounded-lg px-3 py-2 max-h-60 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                  />
                  {d.body.trim() && <div className="flex gap-2">
                    <input
                      value={d.url}
                      onChange={(e) => setDrafts((c) => ({ ...c, [s]: { ...d, url: e.target.value } }))}
                      aria-label="Button link (optional)"
                      placeholder="Button link (optional)"
                      className="min-w-0 flex-1 text-xs bg-card border border-line rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                    <button
                      onClick={() => add(s)}
                      disabled={!!busy}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy === `add-${s}` ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
                    </button>
                  </div>}
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
            <p className="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{issue.pieces.length} {issue.pieces.length === 1 ? "item" : "items"}</span>
              <span aria-hidden>·</span>
              <span>{issue.renderedAt ? `laid out ${new Date(issue.renderedAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "not laid out"}</span>
              {layoutIsStale && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                  title="Text, pictures, or wording preferences changed since the last layout. Review rounds already sent stay as they were.">
                  {canEdit ? "Lay out again" : "Needs a new layout"}
                </span>
              )}
            </p>
            {canEdit && issue.renderedHtml && (
              <button
                title={layoutIsStale ? "Lay out again before copying the updated HTML" : "Copy the HTML for a Mailchimp Code block"}
                onClick={copyHtml}
                disabled={!!busy || layoutIsStale}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card ring-1 ring-inset ring-line text-fg font-bold text-sm hover:bg-elevated disabled:opacity-50"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy HTML"}
              </button>
            )}
            {canEdit && (
              <details className="group mt-4 border-t border-line pt-2">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded px-1.5 text-xs font-semibold text-muted hover:bg-elevated hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                  <FlaskConical size={14} aria-hidden="true" />
                  Experimental features
                  <ChevronDown size={13} aria-hidden="true" className="group-open:rotate-180" />
                </summary>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={generate}
                    disabled={!!busy || !hasContent}
                    className="inline-flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm font-semibold text-fg ring-1 ring-inset ring-line hover:bg-elevated disabled:opacity-60"
                  >
                    {busy === "gen" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {busy === "gen" ? "Laying out…" : "Lay out with AI"}
                  </button>
                  <button
                    onClick={() => setHandoff((v) => !v)}
                    disabled={!!busy || issue.pieces.length === 0}
                    aria-expanded={handoff}
                    className="inline-flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm font-semibold text-fg ring-1 ring-inset ring-line hover:bg-elevated disabled:opacity-60"
                  >
                    <ClipboardPaste size={14} />
                    Own AI
                  </button>
                </div>

              {handoff && (
                <section className="mt-4 rounded-xl border border-line bg-elevated/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-fg">Lay out with your own AI</h3>
                    <button
                      onClick={() => setHandoff(false)}
                      aria-label="Close"
                      className="shrink-0 text-muted hover:text-fg"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={copyBrief}
                      disabled={!!busy}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white font-bold text-[12.5px] hover:bg-brand-700 disabled:opacity-60"
                    >
                      {busy === "brief" ? <Loader2 size={13} className="animate-spin" />
                        : briefCopied ? <Check size={13} /> : <Copy size={13} />}
                      {busy === "brief" ? "Building…" : briefCopied ? "Copied" : "1 · Copy prompt"}
                    </button>
                  </div>

                  <label className="mt-3 block">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
                      2 · Paste the reply
                    </span>
                    <textarea
                      value={paste}
                      onChange={(e) => setPaste(e.target.value)}
                      rows={5}
                      placeholder="Paste the whole reply"
                      className="mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12px] leading-relaxed text-fg outline-none focus:border-brand-500"
                    />
                  </label>

                  <button
                    onClick={applyPaste}
                    disabled={!!busy || !paste.trim()}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card ring-1 ring-inset ring-line text-fg font-bold text-[12.5px] hover:bg-elevated disabled:opacity-50"
                  >
                    <ClipboardPaste size={13} /> 3 · Apply
                  </button>

                  {report && (
                    <div className="mt-3 space-y-1 text-[12px]">
                      {report.applied.length > 0 && (
                        <p className="text-emerald-700">
                          Applied to {report.applied.length}{" "}
                          {report.applied.length === 1 ? "piece" : "pieces"}.
                        </p>
                      )}
                      {!!report.preserved?.length && (
                        <p className="text-emerald-700">
                          Kept submitted wording for {report.preserved.length}{" "}
                          protected {report.preserved.length === 1 ? "piece" : "pieces"}.
                        </p>
                      )}
                      {report.missing.length > 0 && (
                        <p className="text-amber-700">
                          {report.missing.length} not mentioned in the reply — left as{" "}
                          {report.missing.length === 1 ? "it was" : "they were"} (
                          {report.missing.map((m) => m.section).join(", ")}).
                        </p>
                      )}
                      {report.unknown.length > 0 && (
                        <p className="text-amber-700">
                          {report.unknown.length} id{report.unknown.length === 1 ? "" : "s"} in the
                          reply {report.unknown.length === 1 ? "is" : "are"} not in this issue.
                        </p>
                      )}
                      {report.problems.map((pr, i) => (
                        <p key={i} className="text-red-600">{pr}</p>
                      ))}
                    </div>
                  )}
                </section>
              )}
                <NewsletterExperiments key={issue.id} title={issue.title} html={layoutIsStale ? null : issue.renderedHtml} />
              </details>
            )}
          </section>

          {issue.renderedHtml && (
            <section className="rounded-2xl border border-line bg-card overflow-hidden">
              <header className="px-4 py-2.5 border-b border-line/70">
                <h4 className="text-xs font-bold uppercase tracking-wider text-subtle">
                  {layoutIsStale ? "Saved preview — needs a new layout" : "Preview"}
                </h4>
                {layoutIsStale && (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    Text, pictures, or wording preferences have changed. Lay out again before copying HTML.
                    Review rounds already sent stay as they were.
                  </p>
                )}
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
