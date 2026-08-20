"use client";
/**
 * Workspace → Marketing → Merch. The trade-show giveaway shortlist.
 *
 * Cards grouped by tier, filterable four ways, selectable with a running
 * spend estimate, and a copy-to-clipboard quote request for the supplier.
 *
 * All filtering / costing / email logic lives in src/lib/merch/filter.ts so
 * it is testable without a DOM — this file is presentation and state only.
 *
 * Product photos are hotlinked from Business Edge rather than copied into
 * the repo, so a card always shows the listing's current photo. If they ever
 * block that, ProductImage falls back to the product name.
 */
import { useCallback, useMemo, useState } from "react";
import {
  Search, ExternalLink, Check, Copy, Sparkles, AlertTriangle, PackageCheck, X,
} from "lucide-react";
import {
  MERCH, allCategories, orderedTiers, unitPriceAt, nextBreak, itemCostAt, type MerchItem,
} from "@/lib/merch/types";
import {
  EMPTY_FILTERS, buildQuoteEmail, estimateSpend, filterItems, formatCad,
  type MerchFilters,
} from "@/lib/merch/filter";
import { cn } from "@/lib/utils";

/**
 * Supplier photo. Eager, never lazy: in a panel layout the lazy heuristic
 * misfires and images only appear once something forces a paint (a hover,
 * a scroll), which reads as broken. On failure it swaps to the supplier's
 * product name rather than leaving a broken-image icon.
 */
function ProductImage({ item }: { item: MerchItem }) {
  const [failed, setFailed] = useState(false);

  /**
   * onError alone is not enough. The image starts loading while the server
   * HTML is parsed, which is before React hydrates and attaches the handler —
   * so an image that fails early (the hotlink block this is guarding against
   * fails immediately) fires its error event into nothing and would sit there
   * as a broken icon forever. Checking naturalWidth as the node attaches
   * catches exactly that case; onError covers everything after.
   */
  const check = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div className="flex h-40 items-center justify-center rounded-t-2xl bg-elevated px-4 text-center">
        <span className="text-[11px] font-medium leading-snug text-muted">
          {item.supplierProductName}
        </span>
      </div>
    );
  }
  return (
    /* Plain <img>, not next/image: the supplier host isn't in next.config
       remotePatterns, and next/image lazy-loads by default — the exact
       failure this needs to avoid.

       referrerPolicy="no-referrer" because these are hotlinked from Business
       Edge by design. Hotlink protection keys off the Referer header, so
       sending none is more likely to be served than announcing that a
       different domain is embedding their photo. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={check}
      src={item.imageUrl}
      alt={item.supplierProductName}
      loading="eager"
      decoding="sync"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-40 w-full rounded-t-2xl bg-white object-contain p-3"
    />
  );
}

export function MerchBoard() {
  const [filters, setFilters] = useState<MerchFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(MERCH.meta.quantityBasis);
  const [copied, setCopied] = useState(false);

  const categories = useMemo(() => allCategories(), []);
  const tiers = useMemo(() => orderedTiers(), []);
  const visible = useMemo(() => filterItems(MERCH.items, filters), [filters]);
  const chosen = useMemo(
    () => MERCH.items.filter((i) => selected.has(i.id)),
    [selected],
  );
  const spend = useMemo(
    () => estimateSpend(chosen, qty, MERCH.meta),
    [chosen, qty],
  );

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  function toggleSelected(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyQuote() {
    try {
      await navigator.clipboard.writeText(buildQuoteEmail(chosen, qty, MERCH.meta));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — the button simply doesn't confirm */
    }
  }

  const filtersActive =
    filters.tiers.length > 0 ||
    filters.categories.length > 0 ||
    filters.pocketFlatOnly ||
    filters.query.trim() !== "";

  const chip = (active: boolean) =>
    cn(
      "rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset transition-colors",
      active
        ? "bg-brand-600 text-white ring-brand-600"
        : "bg-card text-muted ring-line hover:bg-elevated hover:text-fg",
    );

  return (
    <div className="space-y-5">
      {/* These are estimates. Stated on the tab, not behind a tooltip. */}
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
        <AlertTriangle size={13} className="mr-1.5 inline align-[-2px]" />
        {MERCH.meta.priceDisclaimer}
      </p>

      {/* ── Filters ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
            />
            <input
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search names, supplier products, and the notes"
              aria-label="Search merch"
              className="w-full rounded-lg border border-line bg-card py-1.5 pl-7 pr-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>
          <button
            onClick={() => setFilters((f) => ({ ...f, pocketFlatOnly: !f.pocketFlatOnly }))}
            className={chip(filters.pocketFlatOnly)}
            aria-pressed={filters.pocketFlatOnly}
          >
            <PackageCheck size={11} className="mr-1 inline align-[-2px]" />
            Pocket-flat only
          </button>
          {filtersActive && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-fg"
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-subtle">Tier</span>
          {tiers.map(({ tier, meta }) => (
            <button
              key={tier}
              onClick={() => setFilters((f) => ({ ...f, tiers: toggle(f.tiers, tier) }))}
              className={chip(filters.tiers.includes(tier))}
              aria-pressed={filters.tiers.includes(tier)}
            >
              {meta.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-subtle">Type</span>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilters((f) => ({ ...f, categories: toggle(f.categories, c) }))}
              className={chip(filters.categories.includes(c))}
              aria-pressed={filters.categories.includes(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-subtle">
          Showing {visible.length} of {MERCH.items.length} items
        </p>
      </section>

      {/* ── Selection summary ───────────────────────────────── */}
      {chosen.length > 0 && (
        <section className="sticky top-2 z-10 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-brand-300 bg-brand-50 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-brand-900">
              {spend.count} item{spend.count === 1 ? "" : "s"} selected
            </p>
            <p className="text-[11px] text-brand-800">
              {formatCad(spend.low)} at {qty} units each
              <span className="text-brand-700">
                {" "}
                — supplier break pricing, plus each item&apos;s decoration setup and{" "}
                {formatCad(MERCH.meta.setupFeeCad)} order setup
              </span>
            </p>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-900">
            Qty each
            <input
              type="number"
              min={1}
              max={100000}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-20 rounded-lg border border-brand-300 bg-card px-2 py-1 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={copyQuote}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-bold text-white hover:bg-brand-700"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy quote request"}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[11px] font-semibold text-brand-800 hover:underline"
            >
              Clear
            </button>
          </div>
        </section>
      )}

      {/* ── Tier sections ───────────────────────────────────── */}
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-muted">
          Nothing matches those filters.
        </p>
      ) : (
        tiers.map(({ tier, meta }) => {
          const group = visible.filter((i) => i.tier === tier);
          if (group.length === 0) return null;
          return (
            <section key={tier} className="space-y-3">
              <header>
                <h2 className="text-sm font-bold text-fg">{meta.label}</h2>
                <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted">{meta.blurb}</p>
              </header>

              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.map((item) => {
                  const isPicked = selected.has(item.id);
                  return (
                    <li key={item.id}>
                      <article
                        className={cn(
                          "flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors",
                          isPicked ? "border-brand-400 ring-2 ring-brand-500/25" : "border-line",
                        )}
                      >
                        <ProductImage item={item} />

                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start gap-2">
                            <h3 className="flex-1 text-sm font-bold leading-snug text-fg">{item.name}</h3>
                            {item.pocketFlat && (
                              <span
                                title="Packs flat in a laptop bag"
                                className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted"
                              >
                                flat
                              </span>
                            )}
                          </div>

                          <a
                            href={item.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-start gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900"
                          >
                            {item.supplierProductName}
                            <ExternalLink size={10} className="mt-0.5 shrink-0" />
                          </a>
                          <p className="mt-0.5 font-mono text-[10px] text-subtle">
                            {item.category} · item {item.supplierItemCode}
                          </p>

                          <p className="mt-2 font-mono text-sm font-bold tabular-nums text-fg">
                            ${unitPriceAt(item, qty).toFixed(2)}
                            <span className="ml-1 font-sans text-[10px] font-medium text-subtle">
                              / unit at {qty}
                            </span>
                          </p>
                          <p className="font-mono text-[11px] tabular-nums text-muted">
                            {formatCad(itemCostAt(item, qty, MERCH.meta.setupFeeCad))}
                            <span className="ml-1 font-sans text-[10px] text-subtle">
                              all-in ({qty} + ${item.decorationSetupCad.toFixed(2)} decoration
                              + ${MERCH.meta.setupFeeCad.toFixed(2)} setup)
                            </span>
                          </p>
                          {(() => {
                            // The jump between breaks is often steeper than
                            // the extra units cost, so it is worth naming.
                            const nb = nextBreak(item, qty);
                            if (!nb) return null;
                            const now = unitPriceAt(item, qty);
                            if (nb.unitCad >= now) return null;
                            return (
                              <p className="mt-0.5 text-[10.5px] font-medium text-emerald-700">
                                {nb.minQty.toLocaleString("en-CA")} units drops it to $
                                {nb.unitCad.toFixed(2)} — saving{" "}
                                {formatCad((now - nb.unitCad) * nb.minQty)} on that order
                              </p>
                            );
                          })()}

                          <p className="mt-2 text-xs leading-relaxed text-muted">{item.whyItWorks}</p>

                          <p className="mt-2 text-[11px] leading-relaxed text-subtle">
                            <Sparkles size={10} className="mr-1 inline align-[-1px]" />
                            {item.decoration}
                          </p>

                          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
                            <AlertTriangle size={10} className="mr-1 inline align-[-1px]" />
                            {item.watchOut}
                          </p>

                          <button
                            onClick={() => toggleSelected(item.id)}
                            aria-pressed={isPicked}
                            className={cn(
                              "mt-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-lg pt-0 text-xs font-bold transition-colors",
                              "mt-3",
                              isPicked
                                ? "bg-brand-600 text-white hover:bg-brand-700"
                                : "bg-elevated text-fg ring-1 ring-inset ring-line hover:bg-raised",
                            )}
                          >
                            {isPicked ? <><Check size={13} /> Selected</> : "Select"}
                          </button>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
