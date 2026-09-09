/**
 * Trade-show merch — filtering, cost estimation and the quote-request email.
 *
 * Deliberately pure and DOM-free so the board's logic is unit-testable
 * without rendering anything: the same functions produce what the screen
 * shows and what the clipboard receives, so the two cannot drift.
 */
import { itemCostAt, nextBreak, unitPriceAt, type MerchItem, type MerchMeta, type MerchPriceBreak } from "./types";

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
export function filterItems<T extends MerchItem>(items: T[], f: MerchFilters): T[] {
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
  // Both ends now come from the supplier's real break for this quantity,
  // so at a given qty they are equal — the range only widens when an item
  // has no published breaks. Kept as low/high so callers are unchanged.
  const exact = selected.reduce((sum, i) => sum + itemCostAt(i, qty, meta.setupFeeCad), 0);
  return { count: selected.length, qty, low: exact, high: exact };
}

/**
 * What the order is assumed to cost beyond what the supplier publishes.
 *
 * Every one of these is a guess a person makes, not a number read off a
 * listing, which is exactly why they are inputs rather than constants:
 * the catalogue's own disclaimer says shipping is billed at actual cost
 * and that US-sourced goods carry exchange, brokerage and duty on top.
 * The gap between the two ends of the estimate IS this uncertainty.
 */
export interface OrderAssumptions {
  /**
   * Whether the order setup is charged once, or once per decorated line.
   * A switch rather than a rule because the listings disagree: the tote
   * shows a $65 transfer setup AND a separate $75 "Setup Charge" without
   * saying which method the second belongs to.
   */
  setupPerItem: boolean;
  /** Best case — several listings say free shipping to one metro location. */
  shippingLowCad: number;
  /** Worst case for freight to Toronto. */
  shippingHighCad: number;
  /** Exchange, brokerage and duty on the goods, as a percentage. */
  dutyPct: number;
}

/** Deliberately visible on screen and editable. Nobody quoted these. */
export const DEFAULT_ASSUMPTIONS: OrderAssumptions = {
  setupPerItem: true,
  shippingLowCad: 0,
  shippingHighCad: 400,
  dutyPct: 15,
};

export interface OrderLine {
  item: MerchItem;
  qty: number;
  /** The break this quantity actually reaches. */
  unitCad: number;
  unitsCad: number;
  decorationCad: number;
  /** The next break up, when taking more would cost less each. */
  nextBreak: MerchPriceBreak | null;
}

export interface OrderEstimate {
  lines: OrderLine[];
  count: number;
  /** Units across every line — what the supplier is being asked to make. */
  units: number;
  goodsCad: number;
  decorationCad: number;
  setupCad: number;
  /** Everything the listings actually publish. */
  knownCad: number;
  shippingLowCad: number;
  shippingHighCad: number;
  dutyCad: number;
  low: number;
  high: number;
}

/** The quantity for one item, falling back to the catalogue's basis. */
export function qtyFor(qtyByItem: Record<string, number>, item: MerchItem, basis: number): number {
  const q = qtyByItem[item.id];
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : basis;
}

/**
 * The order, costed line by line, with a range across what nobody has
 * quoted yet.
 *
 *   known = units at the break each line reaches + decoration + setup
 *   low   = known + the best case for shipping
 *   high  = known + the worst case for shipping + duty on the goods
 *
 * Duty is charged on the value of the goods, so it is applied to the
 * units rather than to setup charges, which are labour billed here.
 */
export function estimateOrder(
  selected: MerchItem[],
  qtyByItem: Record<string, number>,
  meta: Pick<MerchMeta, "setupFeeCad" | "quantityBasis">,
  assumptions: OrderAssumptions = DEFAULT_ASSUMPTIONS,
): OrderEstimate {
  const lines: OrderLine[] = selected.map((item) => {
    const qty = qtyFor(qtyByItem, item, meta.quantityBasis);
    const unitCad = unitPriceAt(item, qty);
    return {
      item,
      qty,
      unitCad,
      unitsCad: qty * unitCad,
      decorationCad: item.decorationSetupCad,
      nextBreak: nextBreak(item, qty),
    };
  });

  const goodsCad = lines.reduce((n, l) => n + l.unitsCad, 0);
  const decorationCad = lines.reduce((n, l) => n + l.decorationCad, 0);
  const setupCad = lines.length
    ? assumptions.setupPerItem
      ? meta.setupFeeCad * lines.length
      : meta.setupFeeCad
    : 0;
  const knownCad = goodsCad + decorationCad + setupCad;
  const dutyCad = goodsCad * (assumptions.dutyPct / 100);

  return {
    lines,
    count: lines.length,
    units: lines.reduce((n, l) => n + l.qty, 0),
    goodsCad,
    decorationCad,
    setupCad,
    knownCad,
    shippingLowCad: assumptions.shippingLowCad,
    shippingHighCad: assumptions.shippingHighCad,
    dutyCad,
    low: knownCad + assumptions.shippingLowCad,
    high: knownCad + assumptions.shippingHighCad + dutyCad,
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
  qtyByItem: Record<string, number>,
  meta: Pick<MerchMeta, "supplier" | "currency" | "quantityBasis">,
): string {
  const lines: string[] = [];
  const qtyOf = (i: MerchItem) => qtyFor(qtyByItem, i, meta.quantityBasis);
  const total = selected.reduce((n, i) => n + qtyOf(i), 0);
  lines.push(`Hello ${meta.supplier},`);
  lines.push("");
  lines.push(
    `Could we get a quote in ${meta.currency} for the following, decorated with our logo? ` +
      `Quantities are per item below. Please include setup, decoration and shipping to Toronto, ` +
      `and note anything that is out of stock or has a longer lead time.`,
  );
  lines.push("");
  selected.forEach((i, n) => {
    lines.push(`${n + 1}. ${i.supplierProductName} — ${qtyOf(i).toLocaleString("en-CA")} units`);
    lines.push(`   Item code: ${i.supplierItemCode}`);
    lines.push(`   ${i.productUrl}`);
    lines.push(`   Decoration: ${i.decoration}`);
    lines.push(`   (our reference: ${i.name})`);
    lines.push("");
  });
  lines.push(
    `That is ${selected.length} item${selected.length === 1 ? "" : "s"}, ` +
      `${total.toLocaleString("en-CA")} units in total.`,
  );
  lines.push("");
  lines.push("Thank you,");
  lines.push("BioHubNet");
  return lines.join("\n");
}
