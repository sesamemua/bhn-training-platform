/**
 * Trade-show merch shortlist — types over the static catalogue.
 *
 * items.json is the single source of truth: 25 giveaway items, each already
 * matched to a real product in Business Edge's catalogue. It was generated
 * from the working shortlist artifact; regenerate rather than hand-edit if
 * the shortlist changes.
 *
 * Same pattern as src/lib/equip/tracker.json — the JSON is imported directly
 * (resolveJsonModule is on) and given its shape here, so nothing downstream
 * needs a cast.
 */
import raw from "./items.json";

/** Broad shape of an item. Free-text rather than a union because the
 *  categories are the supplier's, and a new one shouldn't break the build. */
export type MerchCategory = "Tech" | "Wearable" | "Desk" | "Carry" | "Consumable";

export interface MerchTier {
  /** Slug used in filter state and URLs — "walk-up", "qualified-lead". */
  key: string;
  /** Display label, verbatim from the shortlist: "Tier 1 · Walk-up". */
  label: string;
  /** The one-paragraph rationale shown as the section's sub-header. */
  blurb: string;
}

/** One of the supplier's published quantity breaks. */
export interface MerchPriceBreak {
  /** Order this many or more and each unit costs `unitCad`. */
  minQty: number;
  unitCad: number;
}

export interface MerchItem {
  id: string;
  name: string;
  /** 1 | 2 | 3 — kept numeric so sections sort naturally. */
  tier: number;
  tierKey: string;
  category: string;
  /** Fits flat in a laptop bag. The shortlist's packability rule. */
  pocketFlat: boolean;
  /** The supplier's own break pricing, ascending by minQty. This is read
   *  off their listing rather than estimated, which is why the board can
   *  quote a real number at any quantity instead of a range. */
  priceBreaks: MerchPriceBreak[];
  /** Decoration setup for this item — screen/die/engraving charge, on top
   *  of the flat per-order setup in meta.setupFeeCad. */
  decorationSetupCad: number;
  /** Cheapest and dearest break, kept for the at-a-glance range. */
  estUnitCostCad: { low: number; high: number };
  supplierProductName: string;
  supplierItemCode: string;
  productUrl: string;
  /**
   * Supplier's own product shot, served from their site by design — we link
   * rather than copy, so the photo is always whatever they are currently
   * showing on the listing.
   *
   * The trade-off is accepted knowingly: if Business Edge ever rate-limits
   * or hotlink-blocks us, every card degrades to the product name via the
   * fallback in MerchBoard rather than showing a broken image.
   */
  imageUrl: string;
  /** Prose, rendered as authored. Do not rewrite. */
  whyItWorks: string;
  decoration: string;
  watchOut: string;
}

export interface MerchMeta {
  currency: string;
  /** Units per item the estimates assume. */
  quantityBasis: number;
  /** Flat per-item setup charge folded into every estimate. */
  setupFeeCad: number;
  supplier: string;
  /** Shown on the tab itself — these are estimates, not quotes. */
  priceDisclaimer: string;
  urlPatterns: { productUrl: string; imageUrl: string };
}

export interface MerchCatalogue {
  meta: MerchMeta;
  /** Keyed "1" | "2" | "3". */
  tiers: Record<string, MerchTier>;
  items: MerchItem[];
}

export const MERCH: MerchCatalogue = raw as MerchCatalogue;

/**
 * Unit price at a given quantity: the highest break the order reaches.
 * Below the smallest break the supplier will not quote a lower price, so
 * the first break's rate is used rather than pretending it scales down.
 */
export function unitPriceAt(item: MerchItem, qty: number): number {
  const breaks = [...item.priceBreaks].sort((a, b) => a.minQty - b.minQty);
  if (breaks.length === 0) return item.estUnitCostCad.high;
  let price = breaks[0].unitCad;
  for (const b of breaks) if (qty >= b.minQty) price = b.unitCad;
  return price;
}

/**
 * The next break up, when one exists — "500 units drops this to $4.24".
 * The cliff between breaks is often steeper than the quantity increase,
 * so it is worth showing rather than leaving someone to spot it.
 */
export function nextBreak(item: MerchItem, qty: number): MerchPriceBreak | null {
  return [...item.priceBreaks].sort((a, b) => a.minQty - b.minQty).find((b) => b.minQty > qty) ?? null;
}

/** Landed cost for one item at a quantity: units + its own setup. */
export function itemCostAt(item: MerchItem, qty: number, orderSetupCad: number): number {
  return qty * unitPriceAt(item, qty) + item.decorationSetupCad + orderSetupCad;
}

/** Tiers in display order, with their numeric key alongside. */
export function orderedTiers(catalogue: MerchCatalogue = MERCH): { tier: number; meta: MerchTier }[] {
  return Object.entries(catalogue.tiers)
    .map(([n, meta]) => ({ tier: Number(n), meta }))
    .sort((a, b) => a.tier - b.tier);
}

/** Every category present, in first-appearance order. */
export function allCategories(catalogue: MerchCatalogue = MERCH): string[] {
  return [...new Set(catalogue.items.map((i) => i.category))];
}
