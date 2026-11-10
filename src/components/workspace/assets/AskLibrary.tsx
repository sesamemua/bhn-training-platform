"use client";

import { useState } from "react";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import type { AssetCard } from "@/lib/assets/store";
import { postChecks } from "@/lib/assets/core";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Find consented photos from the panel and draft a LinkedIn post",
  "A thank-you post for our sponsors with a booth photo",
  "Recap of the networking lunch",
];

/**
 * The asset agent, in plain words: it searches the library by meaning,
 * keeps only pictures cleared to publish, drafts a LinkedIn post and runs
 * the pre-publish checks. Nothing is created until you press the button.
 */
export function AskLibrary({ onOpen }: { onOpen: (card: AssetCard) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ assets: AssetCard[]; held: number; note?: string } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function ask(text = prompt) {
    if (text.trim().length < 3) return setError("Say what you’re looking for.");
    setBusy(true); setError(null); setCreated(null);
    try {
      const res = await fetch("/api/workspace/assets/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", prompt: text }) });
      const j = await res.json() as { assets?: AssetCard[]; held?: number; draft?: string; note?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? "The agent couldn’t answer. Try again.");
      setResult({ assets: j.assets ?? [], held: j.held ?? 0, note: j.note });
      setPick(j.assets?.[0]?.id ?? null); setDraft(j.draft ?? ""); setTitle(text.slice(0, 80));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function create() {
    if (!pick) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/workspace/assets/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", assetId: pick, title, body: draft }) });
      const j = await res.json() as { href?: string; error?: string };
      if (!res.ok || !j.href) throw new Error(j.error ?? "Couldn’t create the draft.");
      setCreated(j.href);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const chosen = result?.assets.find((a) => a.id === pick) ?? null;
  const checks = result?.assets.length ? postChecks(draft, chosen) : [];

  return (
    <section aria-label="Ask the library" className="rounded-[14px] border border-brand-200 bg-gradient-to-br from-brand-50/80 to-card p-4">
      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex flex-wrap items-center gap-2">
        <Sparkles size={18} className="text-brand-600" aria-hidden />
        <label htmlFor="ask-library" className="sr-only">Ask the library</label>
        <input id="ask-library" value={prompt} onChange={(e) => { setPrompt(e.target.value); setError(null); }} disabled={busy}
          placeholder="Ask the library: find consented photos from the panel and draft a LinkedIn post"
          className="min-w-[220px] flex-1 rounded-[10px] border border-line bg-card-solid px-3 py-2.5 text-sm text-fg" />
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {busy && !result ? "Thinking…" : "Ask"} <ArrowRight size={14} />
        </button>
      </form>
      {!result && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => <button key={x} type="button" disabled={busy} onClick={() => { setPrompt(x); void ask(x); }} className="rounded-full border border-line bg-card-solid px-2.5 py-1 text-[12px] text-fg hover:border-brand-400">{x}</button>)}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
      {result && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-fg">{result.note ?? `${result.assets.length} picture${result.assets.length === 1 ? "" : "s"} cleared to publish${result.held ? ` · ${result.held} held back for consent` : ""}. Pick one:`}</p>
            <button type="button" onClick={() => { setResult(null); setCreated(null); }} aria-label="Close agent results" className="text-subtle hover:text-fg"><X size={16} /></button>
          </div>
          {result.assets.length > 0 && (<>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {result.assets.map((a) => (
                <button key={a.id} type="button" onClick={() => setPick(a.id)} onDoubleClick={() => onOpen(a)} aria-pressed={pick === a.id} title={`${a.title} (double-click for details)`}
                  className={cn("relative w-28 shrink-0 overflow-hidden rounded-[8px] border-2", pick === a.id ? "border-brand-600" : "border-transparent")} style={{ backgroundColor: a.color ?? undefined }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.thumbUrl ?? ""} alt={a.altText ?? a.title} className="block aspect-[4/3] w-full object-cover" />
                </button>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-2">
                <label className="block text-[12px] font-semibold text-muted">Title (for the team)<input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-[8px] border border-line bg-card-solid px-2.5 py-1.5 text-[13px] text-fg" /></label>
                <label className="block text-[12px] font-semibold text-muted">Draft post<textarea value={draft} rows={7} maxLength={3000} onChange={(e) => setDraft(e.target.value)} className="mt-1 w-full rounded-[8px] border border-line bg-card-solid px-2.5 py-2 text-[13px] leading-relaxed text-fg" /></label>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">Pre-publish checks</p>
                <ul className="space-y-1.5 text-[12px]">
                  {checks.map((c) => <li key={c.label} className="flex items-start gap-1.5">{c.ok ? <Check size={14} className="mt-px shrink-0 text-emerald-600" aria-label="Pass" /> : <X size={14} className="mt-px shrink-0 text-amber-600" aria-label="Needs attention" />}<span className={c.ok ? "text-fg" : "text-amber-800"}>{c.label}</span></li>)}
                </ul>
                {created ? (
                  <a href={created} className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-700 px-3 py-2 text-[13px] font-semibold text-white">Open the draft in Social <ArrowRight size={14} /></a>
                ) : (
                  <button type="button" disabled={busy || !pick || !draft.trim() || !title.trim()} onClick={() => void create()} className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] bg-brand px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
                    {busy ? "Creating…" : "Create LinkedIn draft"}
                  </button>
                )}
                <p className="mt-1.5 text-[11px] text-subtle">Creates a draft in Social. Nothing is published.</p>
              </div>
            </div>
          </>)}
        </div>
      )}
    </section>
  );
}
