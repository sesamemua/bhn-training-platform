"use client";
/**
 * Adding a product to the board by pasting its link.
 *
 * Two steps on purpose. Pasting reads the listing and fills in what the
 * supplier publishes — name, item code, photo, the whole price ladder —
 * and then stops, because the rest is editorial: which tier it belongs
 * to, why it works, what to watch out for. Those are written by whoever
 * is adding it, and /merch publishes them to anyone with the link.
 *
 * The big button is here rather than buried in the copy: most of the
 * work is choosing something from a catalogue of thousands, and the
 * board should say where that catalogue is.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, Loader2, Plus, Sparkles, X } from "lucide-react";
import { SUPPLIER_HOME, type DraftCard } from "@/lib/merch/supplier";
import { MERCH } from "@/lib/merch/types";
import { ProductImage } from "@/components/merch/ProductImage";
import { orderedTiers } from "@/lib/merch/types";

type Draft = DraftCard & { tier: number; category: string; pocketFlat: boolean };

export function MerchAddCard() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const tiers = orderedTiers();
  const categories = [...new Set(MERCH.items.map((i) => i.category))];

  async function lookup() {
    setBusy(true); setError(""); setSaved("");
    try {
      const res = await fetch("/api/admin/merch/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Could not read that listing."); return; }
      const d: DraftCard = body.draft;
      setDraft({ ...d, tier: 2, category: categories[0] ?? "Desk", pocketFlat: false });
    } catch {
      setError("Could not read that listing.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/admin/merch/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name, tier: draft.tier, category: draft.category, pocketFlat: draft.pocketFlat,
          priceBreaks: draft.priceBreaks, decorationSetupCad: draft.decorationSetupCad,
          supplierProductName: draft.supplierProductName, supplierItemCode: draft.supplierItemCode,
          productUrl: draft.productUrl, imageUrl: draft.imageUrl,
          whyItWorks: draft.whyItWorks, decoration: draft.decoration, watchOut: draft.watchOut,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Could not save that card."); return; }
      setSaved(draft.name); setDraft(null); setUrl("");
      router.refresh();
    } catch {
      setError("Could not save that card.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40";

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      {/* Amber, because this codebase already uses amber to mean "look
          here" (src/app/globals.css) — and because the hard part of
          adding merch is not the form, it is knowing there are thousands
          of products over there to choose from. The arrow says where the
          sequence starts; it sits in its own row so it can never overlap
          the controls. */}
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
        Start here
        <svg width="34" height="14" viewBox="0 0 34 14" fill="none" aria-hidden className="translate-y-[1px]">
          <path
            d="M1 3c7 0 12 4 18 4h11"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 3"
          />
          <path d="M26 3.5 30.5 7 26 10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={SUPPLIER_HOME}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-amber-950 shadow-sm transition-colors hover:bg-amber-400 sm:shrink-0"
        >
          Browse {MERCH.meta.supplier}&apos;s catalogue
          <ExternalLink size={15} />
        </a>
        {/* The flow, drawn: catalogue → paste it back. Horizontal only,
            since the two stack on a phone and a sideways arrow would
            then point at nothing. */}
        <ArrowRight size={16} className="hidden shrink-0 text-amber-600 sm:block" aria-hidden />
        <div className="flex flex-1 items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && url.trim() && !busy) lookup(); }}
            placeholder="…then paste a product link here"
            aria-label="Paste a Business Edge product link"
            className={field}
          />
          <button
            onClick={lookup}
            disabled={busy || !url.trim()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-elevated px-3 text-xs font-bold text-fg ring-1 ring-inset ring-line hover:bg-raised disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Read listing
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-inset ring-rose-200" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-inset ring-emerald-200" role="status">
          <Sparkles size={12} className="mr-1 inline align-[-2px]" />
          {saved} is on the board.
        </p>
      )}

      {draft && (
        <div className="space-y-3 rounded-xl border border-brand-300 bg-brand-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-700">
                Read from the listing — check it, then add the notes
              </p>
              <p className="text-sm font-bold text-brand-900">{draft.supplierProductName}</p>
              <p className="font-mono text-[10.5px] text-brand-800">
                item {draft.supplierItemCode} ·{" "}
                {draft.priceBreaks.length
                  ? draft.priceBreaks.map((b) => `${b.minQty}: $${b.unitCad.toFixed(2)}`).join("  ·  ")
                  : "no published price breaks found"}
              </p>
            </div>
            <button onClick={() => setDraft(null)} aria-label="Discard this draft" className="text-brand-800 hover:text-brand-900">
              <X size={15} />
            </button>
          </div>

          {draft.imageUrl && (
            <ProductImage
              src={draft.imageUrl}
              alt={draft.supplierProductName}
              className="h-28 w-full rounded-lg bg-white object-contain p-2"
              fallbackClassName="h-28 rounded-lg"
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-semibold text-brand-900">
              Our name for it
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`mt-1 ${field}`} />
            </label>
            <label className="text-[11px] font-semibold text-brand-900">
              Tier
              <select
                value={draft.tier}
                onChange={(e) => setDraft({ ...draft, tier: Number(e.target.value) })}
                className={`mt-1 ${field}`}
              >
                {tiers.map(({ tier, meta }) => <option key={tier} value={tier}>{meta.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold text-brand-900">
              Type
              <input
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                list="merch-categories"
                className={`mt-1 ${field}`}
              />
              <datalist id="merch-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <label className="text-[11px] font-semibold text-brand-900">
              Decoration setup (CAD)
              {draft.setupCandidatesCad.length > 1 && (
                <span className="ml-1 font-normal text-brand-700">
                  listing shows {draft.setupCandidatesCad.map((n) => `$${n.toFixed(2)}`).join(", ")} — pick one
                </span>
              )}
              <input
                type="number" min={0} step="0.01" value={draft.decorationSetupCad}
                onChange={(e) => setDraft({ ...draft, decorationSetupCad: Math.max(0, Number(e.target.value) || 0) })}
                className={`mt-1 ${field}`}
              />
            </label>
          </div>

          <label className="block text-[11px] font-semibold text-brand-900">
            Why it works <span className="font-normal text-brand-700">— published on /merch</span>
            <textarea rows={3} value={draft.whyItWorks} onChange={(e) => setDraft({ ...draft, whyItWorks: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="block text-[11px] font-semibold text-brand-900">
            Decoration
            <textarea rows={2} value={draft.decoration} onChange={(e) => setDraft({ ...draft, decoration: e.target.value })} className={`mt-1 ${field}`} />
          </label>
          <label className="block text-[11px] font-semibold text-brand-900">
            Watch out for
            <textarea rows={2} value={draft.watchOut} onChange={(e) => setDraft({ ...draft, watchOut: e.target.value })} className={`mt-1 ${field}`} />
          </label>

          <label className="flex items-center gap-2 text-[11px] font-semibold text-brand-900">
            <input type="checkbox" checked={draft.pocketFlat} onChange={(e) => setDraft({ ...draft, pocketFlat: e.target.checked })} className="rounded border-brand-300" />
            Packs flat in a laptop bag
          </label>

          <button
            onClick={save}
            disabled={busy || !draft.name.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Add to the board
          </button>
        </div>
      )}
    </section>
  );
}
