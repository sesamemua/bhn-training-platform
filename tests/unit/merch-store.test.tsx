import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BACK_ROOM, MAX_QTY, MIN_QTY, STORE, STORE_DESIGNS, TEE_COLOURS, TEE_PRICE_CAD,
  addToCart, buildReceipt, cartCount, clampQty, findDesign, formatStoreCad, lineKey,
  parseCart, receiptNumber, removeLine, resolveLines, setLineQty, subtotalCad, teeAlt,
  type Cart, type CartLine,
} from "../../src/lib/merch/store";
import { MerchStore } from "../../src/components/merch/MerchStore";

/**
 * The Lucky Flask Pop-Up. Two promises are tested here: the cart maths
 * is right, and the store stays a simulation — nothing on it asks anyone
 * for anything.
 */

const PUBLIC = join(process.cwd(), "public");
const cat = STORE_DESIGNS[0];
const line = (over: Partial<CartLine> = {}): CartLine => ({
  slug: cat.slug, colour: "white", size: "M", qty: 1, ...over,
});

// ── Catalogue ──────────────────────────────────────────────────────

test("every design is complete, uniquely slugged, and its photos exist", () => {
  assert.ok(STORE_DESIGNS.length > 0);
  const slugs = STORE_DESIGNS.map((d) => d.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs must be unique");
  for (const d of STORE_DESIGNS) {
    assert.match(d.slug, /^[a-z0-9-]+$/, `${d.slug} is not URL-safe`);
    assert.ok(d.productName && d.animal && d.blurb && d.badge, `${d.slug} is missing copy`);
    assert.ok(d.labSpecs.length > 0, `${d.slug} has no lab specs`);
    for (const colour of TEE_COLOURS) {
      const src = d.images[colour];
      assert.ok(src.startsWith("/merch-store/"), `${d.slug} ${colour} is not a local image`);
      assert.ok(existsSync(join(PUBLIC, src)), `${d.slug} ${colour}: ${src} is not in public/`);
    }
    assert.notEqual(d.images.white, d.images.black, `${d.slug} shows the same photo for both colours`);
  }
});

test("the hero and back-room art exist too", () => {
  for (const src of [STORE.heroArt.src, ...BACK_ROOM.map((a) => a.src), "/merch-store/4a27cbbe-art.webp"]) {
    assert.ok(existsSync(join(PUBLIC, src)), `${src} is not in public/`);
  }
  // A back-room piece is art only; it must never be confused with a product.
  const productImages = new Set(STORE_DESIGNS.flatMap((d) => Object.values(d.images)));
  for (const a of BACK_ROOM) assert.ok(!productImages.has(a.src));
});

test("alt text names the animal and the colour", () => {
  for (const d of STORE_DESIGNS) {
    for (const colour of TEE_COLOURS) {
      const alt = teeAlt(d, colour);
      assert.ok(alt.includes(d.animal), `${d.slug} alt misses the animal`);
      assert.ok(alt.includes(colour), `${d.slug} alt misses ${colour}`);
    }
  }
});

// ── Cart ───────────────────────────────────────────────────────────

test("quantities clamp to whole tees between 1 and 10", () => {
  assert.equal(MIN_QTY, 1);
  assert.equal(MAX_QTY, 10);
  assert.equal(clampQty(0), 1);
  assert.equal(clampQty(-4), 1);
  assert.equal(clampQty(11), 10);
  assert.equal(clampQty(3.9), 3);
  assert.equal(clampQty(Number.NaN), 1);
  assert.equal(clampQty(Number.POSITIVE_INFINITY), 1);
  assert.equal(clampQty(7), 7);
});

test("adding the same tee twice merges into one line", () => {
  let cart: Cart = [];
  cart = addToCart(cart, line({ qty: 2 }));
  cart = addToCart(cart, line({ qty: 3 }));
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 5);
});

test("a different colour or size is a different line", () => {
  let cart: Cart = [];
  cart = addToCart(cart, line());
  cart = addToCart(cart, line({ colour: "black" }));
  cart = addToCart(cart, line({ size: "XL" }));
  cart = addToCart(cart, line({ slug: STORE_DESIGNS[1].slug }));
  assert.equal(cart.length, 4);
  assert.equal(new Set(cart.map(lineKey)).size, 4);
});

test("a merged line tops out at 10 and a new one is clamped on the way in", () => {
  let cart = addToCart([], line({ qty: 8 }));
  cart = addToCart(cart, line({ qty: 8 }));
  assert.equal(cart[0].qty, 10);
  cart = addToCart(cart, line({ qty: 1 }));
  assert.equal(cart[0].qty, 10, "pressing Add again does not go past the cap");
  assert.equal(addToCart([], line({ qty: 99 }))[0].qty, 10);
  assert.equal(addToCart([], line({ qty: 0 }))[0].qty, 1);
});

test("adding never mutates the cart it was given", () => {
  const cart = addToCart([], line());
  const frozen = JSON.stringify(cart);
  addToCart(cart, line());
  addToCart(cart, line({ size: "S" }));
  assert.equal(JSON.stringify(cart), frozen);
});

test("unknown designs, colours and sizes are ignored", () => {
  assert.deepEqual(addToCart([], line({ slug: "not-a-critter" })), []);
  assert.deepEqual(addToCart([], { ...line(), colour: "teal" as never }), []);
  assert.deepEqual(addToCart([], { ...line(), size: "4XL" as never }), []);
});

test("changing a quantity clamps it and never removes the line", () => {
  const cart = addToCart([], line({ qty: 2 }));
  const key = lineKey(cart[0]);
  assert.equal(setLineQty(cart, key, 6)[0].qty, 6);
  assert.equal(setLineQty(cart, key, 0)[0].qty, 1);
  assert.equal(setLineQty(cart, key, 40)[0].qty, 10);
  assert.deepEqual(setLineQty(cart, "nope|white|M", 5), cart, "an unknown key changes nothing");
});

test("remove takes out exactly one line", () => {
  let cart: Cart = [];
  cart = addToCart(cart, line());
  cart = addToCart(cart, line({ size: "L" }));
  const after = removeLine(cart, lineKey(line()));
  assert.equal(after.length, 1);
  assert.equal(after[0].size, "L");
  assert.equal(removeLine(after, "nope").length, 1);
});

test("count and subtotal add up every tee at the notional price", () => {
  let cart: Cart = [];
  cart = addToCart(cart, line({ qty: 2 }));
  cart = addToCart(cart, line({ colour: "black", qty: 3 }));
  assert.equal(cartCount(cart), 5);
  assert.equal(subtotalCad(cart), 5 * TEE_PRICE_CAD);
  assert.equal(subtotalCad([]), 0);
  // Cents stay cents at a price that does not add cleanly in floating point.
  assert.equal(subtotalCad(addToCart([], line({ qty: 3 })), 0.1), 0.3);
  assert.equal(formatStoreCad(185), "$185.00");
  assert.equal(formatStoreCad(0), "$0.00");
});

test("a stored cart is cleaned, merged and clamped on the way back in", () => {
  assert.deepEqual(parseCart(null), []);
  assert.deepEqual(parseCart("nope"), []);
  assert.deepEqual(parseCart({ slug: cat.slug }), []);
  const cart = parseCart([
    { slug: cat.slug, colour: "white", size: "M", qty: 4 },
    { slug: cat.slug, colour: "white", size: "M", qty: 9 },
    { slug: "retired-critter", colour: "white", size: "M", qty: 1 },
    { slug: cat.slug, colour: "purple", size: "M", qty: 1 },
    { slug: cat.slug, colour: "black", size: "S", qty: "2" },
    { slug: cat.slug, colour: "black", size: "S", qty: -3 },
    null,
    7,
  ]);
  assert.deepEqual(cart, [
    { slug: cat.slug, colour: "white", size: "M", qty: 10 },
    { slug: cat.slug, colour: "black", size: "S", qty: 1 },
  ]);
});

test("lines resolve to their design and a line total", () => {
  const cart = addToCart([], line({ qty: 3 }));
  const [r] = resolveLines(cart);
  assert.equal(r.design, findDesign(cat.slug));
  assert.equal(r.lineTotalCad, 3 * TEE_PRICE_CAD);
  assert.deepEqual(resolveLines([{ slug: "gone", colour: "white", size: "M", qty: 1 }]), []);
});

// ── Receipt ────────────────────────────────────────────────────────

test("the receipt number is stable for the same cart, whatever the order", () => {
  const a = addToCart(addToCart([], line({ qty: 2 })), line({ colour: "black", size: "XS" }));
  const b = addToCart(addToCart([], line({ colour: "black", size: "XS" })), line({ qty: 2 }));
  assert.equal(receiptNumber(a), receiptNumber(a));
  assert.equal(receiptNumber(a), receiptNumber(b));
  assert.match(receiptNumber(a), /^LFP-37C-[0-9A-Z]{3}-[0-9A-Z]{4,}$/);
  assert.notEqual(receiptNumber(a), receiptNumber(setLineQty(a, lineKey(a[0]), 3)), "a different cart prints a different number");
});

test("the receipt totals the cart and then waives all of it", () => {
  const cart = addToCart(addToCart([], line({ qty: 2 })), line({ size: "3XL" }));
  const r = buildReceipt(cart);
  assert.equal(r.count, 3);
  assert.equal(r.subtotalCad, 3 * TEE_PRICE_CAD);
  assert.equal(r.goodwillCad, r.subtotalCad, "the total due is always $0.00");
  assert.equal(r.lines.length, 2);
  assert.equal(r.number, receiptNumber(cart));
});

// ── It stays a simulation ─────────────────────────────────────────

test("the storefront renders, says it is simulated, and asks for nothing", () => {
  const html = renderToStaticMarkup(<MerchStore />);
  assert.ok(html.includes(STORE.name));
  assert.ok(html.includes(STORE.disclaimer.replace(/'/g, "&#x27;")), "the disclaimer is on the page");
  for (const d of STORE_DESIGNS) assert.ok(html.includes(d.productName.replace(/'/g, "&#x27;")), `${d.slug} is missing`);
  assert.ok(html.includes("(simulated)"), "prices say they are simulated");
  assert.ok(html.includes('role="status"'), "there is a live region for Added to cart");

  // No form, and no field of any kind: nothing personal can be typed in.
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<input\b/i);
  assert.doesNotMatch(html, /<textarea\b/i);
  assert.doesNotMatch(html, /<select\b/i);
  assert.doesNotMatch(html, /autocomplete=|card number|cvv|postal code|e-?mail address/i);

  // Every colour picker is a real radio group with a checked option.
  const groups = html.match(/role="radiogroup"/g) ?? [];
  assert.equal(groups.length, STORE_DESIGNS.length);
  assert.equal((html.match(/role="radio" aria-checked="true"/g) ?? []).length, STORE_DESIGNS.length);
});

test("the store makes no network calls of its own", async () => {
  // A static check on the source: the pop-up has no reason to fetch.
  const { readFileSync, readdirSync } = await import("node:fs");
  const dir = join(process.cwd(), "src/components/merch");
  const files = readdirSync(dir).filter((f) => f.startsWith("Store") || f.startsWith("MerchStore"));
  assert.ok(files.length >= 4);
  for (const f of [...files.map((x) => join(dir, x)), join(process.cwd(), "src/lib/merch/store.ts")]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, `${f} talks to the network`);
  }
});
