/**
 * The merch catalogue, minus everything that is nobody else's business.
 *
 * The internal list carries what BHN pays: published break pricing from
 * the supplier, decoration setup fees, an estimated unit-cost range,
 * the supplier's own item code — and `tierKey`, which is how BHN sorts
 * the people it hands these to ("walk-up", "qualified-lead"). None of
 * that belongs on a page anybody can open, and the last one would be
 * plainly rude to publish.
 *
 * A WHITELIST, not a redaction. Listing what may be shown means a field
 * added to items.json next month is invisible here until somebody
 * decides otherwise; listing what must be hidden means the same field
 * is public the moment it is added, and nobody finds out. The test
 * beside this asserts that direction, so the safe default survives.
 */
import { MERCH, type MerchItem } from "./types";

export interface PublicMerchItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  /** The supplier's own page. Public, and safe to forward. */
  productUrl: string;
  /** What the thing is, written for the person receiving it. NOT
   *  `whyItWorks` — that one is buyer-facing and opens by comparing the
   *  tote's price against an item already rejected. */
  publicBlurb: string;
}

/** Fields that may cross the line. Anything absent is withheld. */
const PUBLIC_FIELDS = [
  "id", "name", "category", "imageUrl", "productUrl", "publicBlurb",
] as const satisfies readonly (keyof MerchItem)[];

/** Fields deliberately withheld, named so the reason is on the record. */
export const WITHHELD_FIELDS = [
  "priceBreaks",         // what BHN pays per unit
  "decorationSetupCad",  // and to print on it
  "estUnitCostCad",      // and the range it budgeted
  "supplierItemCode",    // the SKU to re-price the whole list against
  "tier",                // how BHN ranks who gets what
  "tierKey",             // ...in words
  "watchOut",            // internal caveats, written for buyers
  "whyItWorks",          // buyer-facing: cites prices and "logo exposure"
  "supplierProductName", // duplicates name; no reason to ship it
  "decoration",          // quotes the setup cost
  "pocketFlat",
] as const satisfies readonly (keyof MerchItem)[];

export function publicItem(item: MerchItem): PublicMerchItem {
  const out = {} as Record<string, unknown>;
  for (const k of PUBLIC_FIELDS) out[k] = item[k];
  return out as unknown as PublicMerchItem;
}

export function publicCatalogue(): PublicMerchItem[] {
  return MERCH.items.map(publicItem);
}
