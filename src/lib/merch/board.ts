/**
 * The merch board's shape: what is on it, where each item sits, and who
 * has starred what.
 *
 * Pure — no Prisma import — so the workspace board, the public page and
 * the tests all read the same rules and cannot drift. The caller does
 * the queries; this decides what the result means.
 *
 * Two sources feed one list. src/lib/merch/items.json is the committed
 * catalogue and stays the truth for the items in it; MerchCard rows add
 * products somebody pasted, and carry the shelf each item sits on. An
 * item with no row is on the shortlist, which is why moving nothing
 * writes nothing.
 */
import type { MerchItem, MerchPriceBreak } from "./types";

export type BoardStatus = "shortlist" | "not_selected";
export type BoardSource = "catalogue" | "added";

/** A MerchCard row, as far as this module cares. */
export interface CardRow {
  itemId: string;
  source: string;
  status: string;
  name: string | null;
  tier: number | null;
  tierKey: string | null;
  category: string | null;
  pocketFlat: boolean | null;
  priceBreaks: unknown;
  decorationSetupCad: number | null;
  estUnitLowCad: number | null;
  estUnitHighCad: number | null;
  supplierProductName: string | null;
  supplierItemCode: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  whyItWorks: string | null;
  decoration: string | null;
  watchOut: string | null;
  addedBy?: { name: string | null } | null;
}

/** One person's star. */
export interface PickRow {
  itemId: string;
  userId: string;
  user?: { name: string | null } | null;
}

export interface BoardItem extends MerchItem {
  status: BoardStatus;
  source: BoardSource;
  /** Who pasted it in. Null for the committed catalogue. */
  addedByName: string | null;
}

const isStatus = (v: string): v is BoardStatus => v === "shortlist" || v === "not_selected";

/** Price breaks off a JSON column, defensively — the row is JSONB. */
export function readPriceBreaks(raw: unknown): MerchPriceBreak[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is { minQty: number; unitCad: number } =>
      !!b && typeof b === "object" &&
      typeof (b as { minQty?: unknown }).minQty === "number" &&
      typeof (b as { unitCad?: unknown }).unitCad === "number")
    .map((b) => ({ minQty: b.minQty, unitCad: b.unitCad }))
    .sort((a, b) => a.minQty - b.minQty);
}

/** A pasted card, as an item the same card component can render. */
export function itemFromCard(row: CardRow): BoardItem | null {
  // A catalogue row carries status only; without a name there is no item
  // here to build, and the JSON entry is the one that gets used.
  if (!row.name) return null;
  const breaks = readPriceBreaks(row.priceBreaks);
  const lows = breaks.map((b) => b.unitCad);
  return {
    id: row.itemId,
    name: row.name,
    tier: row.tier ?? 2,
    tierKey: row.tierKey ?? "real-conversation",
    category: row.category ?? "Other",
    pocketFlat: row.pocketFlat ?? false,
    priceBreaks: breaks,
    decorationSetupCad: row.decorationSetupCad ?? 0,
    estUnitCostCad: {
      low: row.estUnitLowCad ?? (lows.length ? Math.min(...lows) : 0),
      high: row.estUnitHighCad ?? (lows.length ? Math.max(...lows) : 0),
    },
    supplierProductName: row.supplierProductName ?? row.name,
    supplierItemCode: row.supplierItemCode ?? "",
    productUrl: row.productUrl ?? "",
    imageUrl: row.imageUrl ?? "",
    whyItWorks: row.whyItWorks ?? "",
    decoration: row.decoration ?? "",
    watchOut: row.watchOut ?? "",
    status: isStatus(row.status) ? row.status : "shortlist",
    source: "added",
    addedByName: row.addedBy?.name ?? null,
  };
}

/**
 * The committed catalogue plus everything pasted since, each carrying
 * the shelf it sits on. Catalogue entries keep their JSON values — a row
 * for one of them only ever says where it sits, never what it is.
 */
export function mergeBoard(catalogue: MerchItem[], cards: CardRow[]): BoardItem[] {
  const byId = new Map(cards.map((c) => [c.itemId, c]));
  const fromCatalogue: BoardItem[] = catalogue.map((item) => {
    const row = byId.get(item.id);
    return {
      ...item,
      status: row && isStatus(row.status) ? row.status : "shortlist",
      source: "catalogue" as const,
      addedByName: null,
    };
  });
  const catalogueIds = new Set(catalogue.map((i) => i.id));
  const added = cards
    .filter((c) => !catalogueIds.has(c.itemId))
    .map(itemFromCard)
    .filter((i): i is BoardItem => i !== null);
  return [...fromCatalogue, ...added];
}

export interface PickTally {
  /** How many people starred it. */
  count: number;
  /** Who, in the order the rows arrived. Names only — no ids leave here. */
  names: string[];
  /** Whether the person looking is one of them. */
  mine: boolean;
}

/** Stars per item. An unknown name reads as "Someone" rather than blank. */
export function tallyPicks(picks: PickRow[], viewerId?: string | null): Map<string, PickTally> {
  const out = new Map<string, PickTally>();
  for (const p of picks) {
    const t = out.get(p.itemId) ?? { count: 0, names: [], mine: false };
    t.count += 1;
    t.names.push(p.user?.name?.trim() || "Someone");
    if (viewerId && p.userId === viewerId) t.mine = true;
    out.set(p.itemId, t);
  }
  return out;
}

export interface BoardGroups {
  /** Starred by anybody, most-starred first. Still shown in their tier below. */
  favourites: BoardItem[];
  shortlist: BoardItem[];
  notSelected: BoardItem[];
}

/**
 * The three shelves. Favourites is a view over the shortlist rather than
 * a fourth state — starring something does not take it out of its tier,
 * it just also puts it at the top where the argument happens.
 */
export function groupBoard(items: BoardItem[], tally: Map<string, PickTally>): BoardGroups {
  const shortlist = items.filter((i) => i.status === "shortlist");
  const favourites = shortlist
    .filter((i) => (tally.get(i.id)?.count ?? 0) > 0)
    .sort((a, b) => (tally.get(b.id)?.count ?? 0) - (tally.get(a.id)?.count ?? 0));
  return {
    favourites,
    shortlist,
    notSelected: items.filter((i) => i.status === "not_selected"),
  };
}

/** A slug for a pasted product: readable, stable, and unique per item code. */
export function slugForAddition(name: string, itemCode: string): string {
  const base = `${name}-${itemCode}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return base || `item-${itemCode.toLowerCase()}`;
}
