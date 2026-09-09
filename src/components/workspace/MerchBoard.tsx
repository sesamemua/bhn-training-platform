"use client";
/**
 * The trade-show merch board.
 *
 * Three shelves. Favourites at the top — whatever anybody has starred,
 * most-starred first, because that is where the argument is. The tiers
 * in the middle, as before. Not selected at the bottom, collapsed, so a
 * rejected item is out of the way without being lost.
 *
 * Two kinds of state behind it, and they are deliberately different:
 * a star belongs to the person who left it (one row per person per item,
 * and the count is the tally), while moving something to Not selected is
 * a decision about the board and everyone sees it.
 *
 * Read-only for anyone without `viewer`. /merch renders this same
 * component with no viewer and no picks, so the public page shows the
 * shortlist and nothing about who liked what — see src/app/merch/page.tsx.
 *
 * All filtering, costing and the quote email live in src/lib/merch/*.ts
 * so they are testable without a DOM; this file is presentation and
 * state only.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ExternalLink, Check, Sparkles, AlertTriangle, PackageCheck, X,
  Star, Undo2, EyeOff, ChevronDown,
} from "lucide-react";
import { MERCH, allCategories, orderedTiers, unitPriceAt } from "@/lib/merch/types";
import {
  DEFAULT_ASSUMPTIONS, EMPTY_FILTERS, buildQuoteEmail, filterItems, formatCad, qtyFor,
  type MerchFilters, type OrderAssumptions,
} from "@/lib/merch/filter";
import { groupBoard, tallyPicks, type BoardItem, type PickRow, type PickTally } from "@/lib/merch/board";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/merch/ProductImage";
import { MerchAddCard } from "@/components/workspace/MerchAddCard";
import { MerchTotals } from "@/components/workspace/MerchTotals";

export interface MerchViewer {
  userId: string;
  canEdit: true;
}

export function MerchBoard({
  items, picks = [], viewer,
}: {
  items: BoardItem[];
  picks?: PickRow[];
  viewer?: MerchViewer;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<MerchFilters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [assumptions, setAssumptions] = useState<OrderAssumptions>(DEFAULT_ASSUMPTIONS);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const categories = useMemo(() => allCategories(), []);
  const tiers = useMemo(() => orderedTiers(), []);
  const tally = useMemo(() => tallyPicks(picks, viewer?.userId), [picks, viewer?.userId]);
  const groups = useMemo(() => groupBoard(items, tally), [items, tally]);

  // Filters apply to the shelves, never to the totals: an item you
  // selected and then filtered out is still in the order.
  const visible = useMemo(() => filterItems(groups.shortlist, filters), [groups.shortlist, filters]);
  const visibleFavourites = useMemo(() => filterItems(groups.favourites, filters), [groups.favourites, filters]);
  const chosen = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  function toggleSelected(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send(path: string, method: string, body?: unknown) {
    setBusyId(path);
    try {
      const res = await fetch(path, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (res.ok) router.refresh();
    } catch {
      /* the row simply does not move; a refresh shows the truth */
    } finally {
      setBusyId(null);
    }
  }

  const toggleStar = (item: BoardItem) =>
    send(`/api/admin/merch/picks/${item.id}`, tally.get(item.id)?.mine ? "DELETE" : "PUT");

  const setStatus = (item: BoardItem, status: "shortlist" | "not_selected") =>
    send(`/api/admin/merch/cards/${item.id}`, "PATCH", { status });

  async function copyQuote() {
    try {
      await navigator.clipboard.writeText(buildQuoteEmail(chosen, qtyByItem, MERCH.meta));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — the button simply doesn't confirm */
    }
  }

  const filtersActive =
    filters.tiers.length > 0 || filters.categories.length > 0 ||
    filters.pocketFlatOnly || filters.query.trim() !== "";

  const chip = (active: boolean) =>
    cn(
      "rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset transition-colors",
      active ? "bg-brand-600 text-white ring-brand-600"
             : "bg-card text-muted ring-line hover:bg-elevated hover:text-fg",
    );

  const card = (item: BoardItem) => (
    <li key={item.id}>
      <Card
        item={item}
        qty={qtyFor(qtyByItem, item, MERCH.meta.quantityBasis)}
        picked={selected.has(item.id)}
        tally={tally.get(item.id)}
        viewer={viewer}
        busy={busyId !== null}
        onSelect={() => toggleSelected(item.id)}
        onStar={() => toggleStar(item)}
        onStatus={(s) => setStatus(item, s)}
      />
    </li>
  );

  return (
    <div className="space-y-5">
      {/* These are estimates. Stated on the tab, not behind a tooltip. */}
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
        <AlertTriangle size={13} className="mr-1.5 inline align-[-2px]" />
        {MERCH.meta.priceDisclaimer}
      </p>

      {viewer && <MerchAddCard />}

      {/* ── Filters ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
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
          Showing {visible.length} of {groups.shortlist.length} on the shortlist
          {groups.notSelected.length > 0 && ` · ${groups.notSelected.length} set aside`}
        </p>
      </section>

      {/* ── The order ───────────────────────────────────────── */}
      {chosen.length > 0 && (
        <MerchTotals
          chosen={chosen}
          qtyByItem={qtyByItem}
          onQty={(id, q) => setQtyByItem((cur) => ({ ...cur, [id]: q }))}
          assumptions={assumptions}
          onAssumptions={setAssumptions}
          onCopyQuote={copyQuote}
          copied={copied}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* ── Favourites ──────────────────────────────────────── */}
      {visibleFavourites.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <header>
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-fg">
              <Star size={14} className="fill-amber-400 text-amber-500" /> Favourites
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              What the team has starred, most stars first. Still listed in their tier below.
            </p>
          </header>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleFavourites.map(card)}
          </ul>
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
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{group.map(card)}</ul>
            </section>
          );
        })
      )}

      {/* ── Not selected ────────────────────────────────────── */}
      {viewer && groups.notSelected.length > 0 && (
        <section className="rounded-2xl border border-line bg-card">
          <button
            onClick={() => setShowRejected((v) => !v)}
            aria-expanded={showRejected}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <EyeOff size={14} className="text-subtle" />
            <span className="text-sm font-bold text-fg">Not selected</span>
            <span className="text-xs text-muted">
              {groups.notSelected.length} set aside — hidden from /merch
            </span>
            <ChevronDown size={15} className={cn("ml-auto text-subtle transition-transform", showRejected && "rotate-180")} />
          </button>
          {showRejected && (
            <ul className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.notSelected.map(card)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Card({
  item, qty, picked, tally, viewer, busy, onSelect, onStar, onStatus,
}: {
  item: BoardItem;
  qty: number;
  picked: boolean;
  tally?: PickTally;
  viewer?: MerchViewer;
  busy: boolean;
  onSelect: () => void;
  onStar: () => void;
  onStatus: (status: "shortlist" | "not_selected") => void;
}) {
  const rejected = item.status === "not_selected";
  const stars = tally?.count ?? 0;
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors",
        picked ? "border-brand-400 ring-2 ring-brand-500/25" : "border-line",
        rejected && "opacity-70",
      )}
    >
      <div className="relative">
        <ProductImage
          src={item.imageUrl}
          alt={item.supplierProductName}
          className="h-40 w-full rounded-t-2xl bg-white object-contain p-3"
          fallbackClassName="h-40 rounded-t-2xl"
        />
        {viewer && (
          <button
            onClick={onStar}
            disabled={busy}
            aria-pressed={!!tally?.mine}
            aria-label={tally?.mine ? `Remove your star from ${item.name}` : `Star ${item.name}`}
            title={stars > 0 ? tally?.names.join(", ") : "Nobody has starred this yet"}
            className={cn(
              "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold shadow-sm ring-1 ring-inset transition-colors disabled:opacity-50",
              tally?.mine
                ? "bg-amber-400 text-amber-950 ring-amber-500"
                : "bg-card/90 text-muted ring-line hover:text-amber-600",
            )}
          >
            <Star size={12} className={cn(stars > 0 && "fill-current")} />
            {stars > 0 && stars}
          </button>
        )}
        {item.source === "added" && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">
            added{item.addedByName ? ` by ${item.addedByName.split(" ")[0]}` : ""}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-sm font-bold leading-snug text-fg">{item.name}</h3>
          {item.pocketFlat && (
            <span title="Packs flat in a laptop bag" className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted">
              flat
            </span>
          )}
        </div>

        {item.productUrl ? (
          <a
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-start gap-1 text-[11px] font-semibold text-brand-700 hover:text-brand-900"
          >
            {item.supplierProductName}
            <ExternalLink size={10} className="mt-0.5 shrink-0" />
          </a>
        ) : (
          <p className="mt-1 text-[11px] font-semibold text-muted">{item.supplierProductName}</p>
        )}
        <p className="mt-0.5 font-mono text-[10px] text-subtle">
          {item.category}
          {item.supplierItemCode && ` · item ${item.supplierItemCode}`}
        </p>

        <p className="mt-2 font-mono text-sm font-bold tabular-nums text-fg">
          ${unitPriceAt(item, qty).toFixed(2)}
          <span className="ml-1 font-sans text-[10px] font-medium text-subtle">/ unit at {qty}</span>
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted">
          + {formatCad(item.decorationSetupCad)}
          <span className="ml-1 font-sans text-[10px] text-subtle">decoration setup</span>
        </p>

        {item.whyItWorks && <p className="mt-2 text-xs leading-relaxed text-muted">{item.whyItWorks}</p>}

        {item.decoration && (
          <p className="mt-2 text-[11px] leading-relaxed text-subtle">
            <Sparkles size={10} className="mr-1 inline align-[-1px]" />
            {item.decoration}
          </p>
        )}

        {item.watchOut && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertTriangle size={10} className="mr-1 inline align-[-1px]" />
            {item.watchOut}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-3">
          <button
            onClick={onSelect}
            aria-pressed={picked}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors",
              picked ? "bg-brand-600 text-white hover:bg-brand-700"
                     : "bg-elevated text-fg ring-1 ring-inset ring-line hover:bg-raised",
            )}
          >
            {picked ? <><Check size={13} /> In the order</> : "Add to order"}
          </button>
          {viewer && (
            <button
              onClick={() => onStatus(rejected ? "shortlist" : "not_selected")}
              disabled={busy}
              title={rejected ? "Put it back on the shortlist" : "Set aside — hides it from /merch"}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-muted ring-1 ring-inset ring-line hover:bg-elevated hover:text-fg disabled:opacity-50"
            >
              {rejected ? <><Undo2 size={12} /> Bring back</> : <><EyeOff size={12} /> Not for us</>}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
