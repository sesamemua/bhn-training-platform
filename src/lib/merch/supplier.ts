/**
 * Reading a Business Edge listing into a merch card.
 *
 * Pure: this module takes HTML and gives back a product. The fetching
 * lives in the API route, so the parsing can be tested against saved
 * fixtures without a network.
 *
 * How the site is shaped. A product page at /p/<CODE>/<slug> is a shell;
 * the detail lives in an iframe at /ws/ws.dll/PrDtl?siteID=…&SPC=<code>,
 * which is the page this module parses. Their own robots.txt disallows
 * /ws/ and then explicitly allows /ws/ws.dll/PrDtl and /ws/ws.dll/QPic —
 * the detail and the photos — which is why reading one listing when a
 * person pastes its link is a sanctioned use rather than a scrape around
 * the back.
 *
 * Two things are read, in order of how much they can be trusted:
 *
 *   1. schema.org JSON-LD in the head — name, sku, image, description.
 *      Structured data the site publishes for machines, so it survives a
 *      redesign that would break any selector.
 *   2. The quantity table — the price ladder. There is no structured
 *      form of it, so it is parsed from the markup and pinned by tests
 *      against the four items already committed in items.json: if the
 *      table changes shape, a test fails rather than a card quietly
 *      losing its pricing.
 *
 * Setup charges are deliberately NOT trusted. A listing can show more
 * than one ("$65.00 full-colour-transfer setup" and a separate "Setup
 * Charge: $75.00" on the same page, with nothing saying which method the
 * second belongs to) — the tote's own watch-out in items.json says so.
 * They are returned as candidates for a person to choose between.
 */
import type { MerchPriceBreak } from "./types";

export const SUPPLIER_HOME = "https://products.thebiznessedge.com/";
const SITE_ID = "26204";

/** The item code out of any form of listing link. */
export function productCodeFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!/(^|\.)thebiznessedge\.com$/i.test(url.hostname)) return null;
  // /p/DQTKC-LWSRD/pop-up-phone-holder
  const path = url.pathname.match(/\/p\/([A-Za-z]{5}-[A-Za-z]{5})(?:\/|$)/);
  if (path) return path[1].toUpperCase();
  // …/PrDtl?SPC=dqtkc-lwsrd
  const spc = url.searchParams.get("SPC");
  if (spc && /^[A-Za-z]{5}-[A-Za-z]{5}$/.test(spc)) return spc.toUpperCase();
  return null;
}

/** Where the detail actually lives, for a given code. */
export function detailUrlFor(code: string): string {
  return `${SUPPLIER_HOME}ws/ws.dll/PrDtl?siteID=${SITE_ID}&SPC=${code.toLowerCase()}&`;
}

/** The public listing, for the link on the card. */
export function listingUrlFor(code: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${SUPPLIER_HOME}p/${code.toUpperCase()}/${slug}`;
}

export interface ParsedProduct {
  name: string;
  itemCode: string;
  imageUrl: string;
  description: string;
  priceBreaks: MerchPriceBreak[];
  /** Every setup charge the listing mentions — a person picks. */
  setupCandidatesCad: number[];
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();

/**
 * The price ladder, off the quantity table.
 *
 * Rows read "<qty> Pcs. Per Unit: 1 … $<price>", and the table carries
 * trailing empty rows with "Pcs. Per Unit: 0" that must not be picked
 * up — hence matching on the 1 rather than on any number.
 */
export function parsePriceBreaks(html: string): MerchPriceBreak[] {
  for (const table of html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? []) {
    if (!/Quantity/i.test(table) || !/Pcs\. Per Unit/i.test(table)) continue;
    const text = textOf(table);
    const rows = [...text.matchAll(/([\d,]+)\s+Pcs\. Per Unit: 1\s+\$([\d.]+)/g)];
    if (!rows.length) continue;
    const breaks = rows
      .map((m) => ({ minQty: Number(m[1].replace(/,/g, "")), unitCad: Number(m[2]) }))
      .filter((b) => Number.isFinite(b.minQty) && Number.isFinite(b.unitCad) && b.minQty > 0 && b.unitCad > 0);
    if (breaks.length) return breaks.sort((a, b) => a.minQty - b.minQty);
  }
  return [];
}

/** Every dollar figure the listing calls a setup charge. */
export function parseSetupCandidates(html: string): number[] {
  const text = textOf(html.replace(/<script[\s\S]*?<\/script>/gi, ""));
  const found = new Set<number>();
  for (const m of text.matchAll(/set[\s-]?up[^$.]{0,40}\$\s?([\d,]+\.\d{2})/gi)) {
    found.add(Number(m[1].replace(/,/g, "")));
  }
  for (const m of text.matchAll(/\$\s?([\d,]+\.\d{2})[^$.]{0,20}set[\s-]?up/gi)) {
    found.add(Number(m[1].replace(/,/g, "")));
  }
  return [...found].filter((n) => n > 0).sort((a, b) => a - b);
}

/** The product a listing describes, or null when the page is not one. */
export function parseProductPage(html: string): ParsedProduct | null {
  const ld = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!ld) return null;
  let data: { name?: string; sku?: string; image?: unknown; description?: string };
  try {
    data = JSON.parse(ld[1]);
  } catch {
    return null;
  }
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const sku = typeof data.sku === "string" ? data.sku.trim().toUpperCase() : "";
  if (!name || !sku) return null;

  const rawImage = Array.isArray(data.image) ? data.image[0] : data.image;
  // Their JSON-LD asks for an 1800px render; the cards want the 400 the
  // committed catalogue uses, and a relative path needs the host back on.
  let imageUrl = typeof rawImage === "string" ? rawImage.replace(/PX=\d+/, "PX=400") : "";
  if (imageUrl.startsWith("/")) imageUrl = `${SUPPLIER_HOME.replace(/\/$/, "")}${imageUrl}`;

  return {
    name,
    itemCode: sku,
    imageUrl,
    description: typeof data.description === "string" ? decode(data.description).trim() : "",
    priceBreaks: parsePriceBreaks(html),
    setupCandidatesCad: parseSetupCandidates(html),
  };
}

export interface DraftCard {
  name: string;
  supplierProductName: string;
  supplierItemCode: string;
  productUrl: string;
  imageUrl: string;
  priceBreaks: MerchPriceBreak[];
  estUnitLowCad: number;
  estUnitHighCad: number;
  decorationSetupCad: number;
  whyItWorks: string;
  decoration: string;
  watchOut: string;
  setupCandidatesCad: number[];
}

/**
 * A card for a person to finish. The supplier's own words go in the
 * description; the three prose fields are left for whoever adds it,
 * because they are editorial, they compare against items already
 * rejected, and /merch publishes them.
 */
export function draftCardFrom(p: ParsedProduct): DraftCard {
  const units = p.priceBreaks.map((b) => b.unitCad);
  return {
    name: p.name,
    supplierProductName: p.name,
    supplierItemCode: p.itemCode,
    productUrl: listingUrlFor(p.itemCode, p.name),
    imageUrl: p.imageUrl,
    priceBreaks: p.priceBreaks,
    estUnitLowCad: units.length ? Math.min(...units) : 0,
    estUnitHighCad: units.length ? Math.max(...units) : 0,
    decorationSetupCad: p.setupCandidatesCad[0] ?? 0,
    whyItWorks: p.description,
    decoration: "",
    watchOut: p.priceBreaks.length
      ? ""
      : "No published price breaks were found on the listing — confirm pricing with Business Edge before budgeting.",
    setupCandidatesCad: p.setupCandidatesCad,
  };
}
