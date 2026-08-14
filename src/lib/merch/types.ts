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

export interface MerchItem {
  id: string;
  name: string;
  /** 1 | 2 | 3 — kept numeric so sections sort naturally. */
  tier: number;
  tierKey: string;
  category: string;
  /** Fits flat in a laptop bag. The shortlist's packability rule. */
  pocketFlat: boolean;
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
