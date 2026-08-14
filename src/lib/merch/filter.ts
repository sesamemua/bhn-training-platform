/**
 * Trade-show merch — filtering, cost estimation and the quote-request email.
 *
 * Deliberately pure and DOM-free so the board's logic is unit-testable
 * without rendering anything: the same functions produce what the screen
 * shows and what the clipboard receives, so the two cannot drift.
 */
import type { MerchItem, MerchMeta } from "./types";

export interface MerchFilters {
  /** Tier numbers to include. Empty = all tiers. */
  tiers: number[];
  /** Categories to include. Empty = all categories. */
  categories: string[];
  /** Only items that pack flat. */
  pocketFlatOnly: boolean;
  /** Free text across name, supplier product name and the prose fields. */
  query: string;
}

export const EMPTY_FILTERS: MerchFilters = {
  tiers: [],
  categories: [],
  pocketFlatOnly: false,
  query: "",
};

/**
 * All four filters combine (AND). Search matches the prose too — someone
 * looking for "engrave" or "carry-on" is searching the reasoning, not just
 * the product names.
 */
export function filterItems(items: MerchItem[], f: MerchFilters): MerchItem[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((i) => {
    if (f.tiers.length && !f.tiers.includes(i.tier)) return false;
    if (f.categories.length && !f.categories.includes(i.category)) return false;
    if (f.pocketFlatOnly && !i.pocketFlat) return false;
    if (!q) return true;
    return [
      i.name,
      i.supplierProductName,
      i.supplierItemCode,
      i.whyItWorks,
      i.decoration,
      i.watchOut,
      i.category,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export interface SpendEstimate {
  count: number;
  qty: number;
  low: number;
  high: number;
}

/**
 * Estimated spend for the selected items at `qty` units each.
 *
 * Per item: qty × unit cost + a flat setup charge, so the setup is counted
 * once per item rather than once per order — the shortlist's convention,
 * because each item is a separate decorated line on the quote.
 */
export function estimateSpend(
  selected: MerchItem[],
  qty: number,
  meta: Pick<MerchMeta, "setupFeeCad">,
): SpendEstimate {
  const setup = meta.setupFeeCad;
  return {
    count: selected.length,
    qty,
    low: selected.reduce((sum, i) => sum + qty * i.estUnitCostCad.low + setup, 0),
    high: selected.reduce((sum, i) => sum + qty * i.estUnitCostCad.high + setup, 0),
  };
}

/** "$1,234" — whole dollars; these are estimates, so cents are false precision. */
export function formatCad(value: number): string {
  return `$${Math.round(value).toLocaleString("en-CA")}`;
}

/**
 * The quote-request email. Leads with the supplier's own product names and
 * item codes, because that is what they can look up — our internal names
 * mean nothing to them, so they follow in brackets.
 */
export function buildQuoteEmail(
  selected: MerchItem[],
  qty: number,
  meta: Pick<MerchMeta, "supplier" | "currency">,
): string {
  const lines: string[] = [];
  lines.push(`Hello ${meta.supplier},`);
  lines.push("");
  lines.push(
    `Could we get a quote in ${meta.currency} for the following, at ${qty} units each, decorated with our logo? ` +
      `Please include setup, decoration and shipping to Toronto, and note anything that is out of stock or has a longer lead time.`,
  );
  lines.push("");
  selected.forEach((i, n) => {
    lines.push(`${n + 1}. ${i.supplierProductName}`);
    lines.push(`   Item code: ${i.supplierItemCode}`);
    lines.push(`   ${i.productUrl}`);
    lines.push(`   Decoration: ${i.decoration}`);
    lines.push(`   (our reference: ${i.name})`);
    lines.push("");
  });
  lines.push(`That is ${selected.length} item${selected.length === 1 ? "" : "s"} at ${qty} units each.`);
  lines.push("");
  lines.push("Thank you,");
  lines.push("BioHubNet");
  return lines.join("\n");
}
