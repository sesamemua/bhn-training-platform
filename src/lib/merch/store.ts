/**
 * BHN Merch Store — the Lucky Flask Pop-Up.
 *
 * A pretend shop for the BioHubNet lab-mascot tees, shown under
 * Workspace → Merch → BHN Merch Store and, for anyone, at /merch/store.
 * It is a simulation on purpose: nothing is charged, shipped or sent, and
 * the only thing kept is the visitor's own cart in their own browser.
 * That is why there is no name, email, address or payment step anywhere
 * in it — there is nothing for such a field to feed.
 *
 * The catalogue and the cart maths live here, pure and DOM-free, so the
 * storefront and its tests cannot disagree (tests/unit/merch-store.test.ts).
 *
 * The images are cut from the mascot mockups into public/merch-store/:
 * `<id>-white.webp` and `<id>-black.webp` are the two tees, 800×900.
 */

// ── Options ────────────────────────────────────────────────────────

export const TEE_COLOURS = ["white", "black"] as const;
export type TeeColour = (typeof TEE_COLOURS)[number];

export const COLOUR_LABEL: Record<TeeColour, string> = { white: "White", black: "Black" };

export const TEE_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
export type TeeSize = (typeof TEE_SIZES)[number];

/**
 * Approximate unisex chest widths. Labelled approximate on screen: these
 * are ordinary crew-neck numbers, not a supplier's spec — there is no
 * supplier.
 */
export const SIZE_CHART: { size: TeeSize; chestCm: string }[] = [
  { size: "XS", chestCm: "81–86" },
  { size: "S", chestCm: "86–91" },
  { size: "M", chestCm: "97–102" },
  { size: "L", chestCm: "107–112" },
  { size: "XL", chestCm: "117–122" },
  { size: "2XL", chestCm: "127–132" },
  { size: "3XL", chestCm: "137–142" },
];

export const MIN_QTY = 1;
export const MAX_QTY = 10;

/** Notional, and always shown as "(simulated)". Priced at incubator temperature. */
export const TEE_PRICE_CAD = 37;

export const PRODUCT_IMAGE_SIZE = { width: 800, height: 900 } as const;
export const ART_IMAGE_SIZE = { width: 1000, height: 1000 } as const;

/** One browser, one cart. Versioned so a future shape change can start clean. */
export const CART_STORAGE_KEY = "bhn-merch-store:cart:v1";

// ── Copy ───────────────────────────────────────────────────────────

export const STORE = {
  name: "Lucky Flask Pop-Up",
  tagline:
    "Cleanroom-grade cuteness, one paw up. Pick a lab critter, pick a size, pipette responsibly.",
  disclaimer: "This is a simulated pop-up store for fun: nothing is charged, shipped or saved.",
  sizeGuide:
    "Unisex crew-neck tee in a relaxed fit, sizes XS–3XL, in white or black. Between sizes? Go up one; there is always room for a lab coat on top. (It's a simulation, so every size fits perfectly in theory.)",
  checkoutCopy: [
    "Order received! Your tee ships in two incubation cycles (37 °C, 5% CO₂, zero actual shipping).",
    "Total due: $0.00, settled in goodwill and one fresh pipette tip.",
    "Order logged in the lab notebook, in pencil, so nothing is actually saved.",
    "Status: passaged to the packing bench… just kidding, it's a simulation.",
    "Receipt printed on imaginary autoclave tape. The stripes turned dark, so it's official.",
  ],
  emptyCartCopy:
    "Your cart is as empty as a freshly wiped biosafety cabinet. Add a lab critter to get things growing.",
  extraJokes: [
    "Fits like a gown, washes like a tee.",
    "Every shirt passes QC: Quite Cute.",
    "Returns policy: resuspend gently and try again.",
    "Side effects may include spontaneous waving.",
    "Always pre-wet your tip, and your enthusiasm.",
    "No lab critters were rushed in the making of these designs.",
  ],
  heroArt: {
    src: "/merch-store/01d94c05-art.webp",
    alt: "The Lucky Flask mascot: a white lucky cat in a cleanroom suit and teal visor, one paw holding a pipette, the other a pink cell-culture flask",
  },
} as const;

// ── Catalogue ──────────────────────────────────────────────────────

export interface StoreDesign {
  slug: string;
  productName: string;
  /** Who is on the shirt, in the words the alt text uses. */
  animal: string;
  blurb: string;
  labSpecs: string[];
  badge: string;
  images: Record<TeeColour, string>;
}

const tee = (id: string): Record<TeeColour, string> => ({
  white: `/merch-store/${id}-white.webp`,
  black: `/merch-store/${id}-black.webp`,
});

export const STORE_DESIGNS: StoreDesign[] = [
  {
    slug: "lucky-cat",
    productName: "Lucky Cat-alyst",
    animal: "white lucky cat",
    blurb:
      "The mascot that started it all: one paw up to say hello, the other steadying a flask of very happy cells. Said to bring good fortune to every passage.",
    labSpecs: ["GMP-compliant cuteness", "Bell calibrated to 1 µL of jingle", "Waves at 37 °C, 5% CO₂"],
    badge: "Bestseller in Bay 3",
    images: tee("e2ad4359"),
  },
  {
    slug: "raccoon",
    productName: "Raccoon-stitution Buffer",
    animal: "raccoon",
    blurb:
      "A very tidy raccoon who only rummages through the −80 with a signed request. Striped tail, spotless technique.",
    labSpecs: ["Ringed tail, zero cross-contamination", "Snacks stay outside the biosafety cabinet", "Labels every tube. Twice."],
    badge: "Night-shift favourite",
    images: tee("2c2c7e4e"),
  },
  {
    slug: "giant-panda",
    productName: "Panda-monium at Passage 3",
    animal: "giant panda",
    blurb:
      "Black, white and gowned all over. This panda counts cells the way it eats bamboo: slowly, happily and with excellent posture.",
    labSpecs: ["Two-tone, fully aseptic", "Rated for 12 hours of hood time", "Bamboo-grade pipetting grip"],
    badge: "Monochrome classic",
    images: tee("0e50cae3"),
  },
  {
    slug: "otter",
    productName: "Otterly Aseptic",
    animal: "river otter",
    blurb:
      "A river otter who treats every media change like a smooth swim: calm, confident and never a drop spilled. Holds the flask like its favourite rock.",
    labSpecs: ["Otterly reproducible results", "Water-resistant whiskers", "Classic bell collar"],
    badge: "Staff pick",
    images: tee("a3816fe3"),
  },
  {
    slug: "mouse",
    productName: "Mouse-t Have Tee",
    animal: "mouse",
    blurb:
      "Big ears for hearing the centrifuge finish, tiny paws for precision pipetting. Small critter, big results.",
    labSpecs: ["Micro-scale, macro-cute", "Ears tuned to the centrifuge beep", "Fits in any multichannel workflow"],
    badge: "Big-ear energy",
    images: tee("91e3d803"),
  },
  {
    slug: "tiger",
    productName: "Easy Tiger, Slow Plunger",
    animal: "tiger cub",
    blurb:
      "Fierce about sterility, gentle on the plunger. This tiger cub brings big-cat focus to small-volume work.",
    labSpecs: ["Stripes: batch-to-batch consistent", "Pounces on first stop, never second", "Class 100 fluff"],
    badge: "Fierce fit",
    images: tee("6e635667"),
  },
  {
    slug: "monkey",
    productName: "Monkey Business Casual",
    animal: "monkey",
    blurb: "The only monkey business allowed in the cleanroom. Tail tucked, gown on, pipette up.",
    labSpecs: ["Tail neatly cable-managed", "Opposable thumbs, multichannel ready", "Swings between tasks, never between hoods"],
    badge: "Most likely to multitask",
    images: tee("968abc90"),
  },
  {
    slug: "rat",
    productName: "Lab Rat-ified",
    animal: "rat",
    blurb:
      "The proud lab rat of the crew, ratified by unanimous committee vote. Pink tail, pink media, perfectly on brand.",
    labSpecs: ["Colour-matched to phenol red", "Knows every shortcut to the autoclave", "Whiskers pre-sterilized"],
    badge: "Crew favourite",
    images: tee("8b4b1dfd"),
  },
  {
    slug: "otter-diamond-tag",
    productName: "Otter-thentic Diamond Edition",
    animal: "river otter wearing a BioHubNet diamond tag",
    blurb:
      "Same calm otter, now wearing a BioHubNet diamond tag on its collar. For when you want the whole hub to know where you train.",
    labSpecs: ["Diamond tag: 0 carats, 100% hub", "Limited-edition collar hardware", "Otterly on brand"],
    badge: "Logo edition",
    images: tee("ac64c812"),
  },
  {
    slug: "husky",
    productName: "Mush Room Temperature",
    animal: "Siberian husky pup",
    blurb:
      "Bred for cold rooms and 4 °C walk-ins, this husky pup pulls its weight on every media prep. Fluffy tail, steady paws.",
    labSpecs: ["Rated down to 4 °C", "Double coat under a single-use gown", "Pulls a full rack without complaint"],
    badge: "Cold-room approved",
    images: tee("283346b7"),
  },
  {
    slug: "otter-bell-free",
    productName: "Quiet Otter-ation",
    animal: "river otter with a bell-free collar",
    blurb:
      "For deep-focus days: same otter, no jingle. The bell stays home so the plate reader can hear itself think.",
    labSpecs: ["0 dB collar", "Library-mode approved", "Bigger print, smaller noise"],
    badge: "Quiet-hours edition",
    images: tee("c351bb9e"),
  },
];

/**
 * Art that is not on the rail. Shown as a teaser shelf, never buyable —
 * a design only becomes a product once it has both tee mockups.
 */
export const BACK_ROOM: { src: string; name: string; alt: string }[] = [
  {
    src: "/merch-store/d7df1a4b-art.webp",
    name: "Dam Good Technique",
    alt: "A beaver in a cleanroom suit holding a pipette and a pink cell-culture flask",
  },
  {
    src: "/merch-store/1887cce4-art.webp",
    name: "Grant Approved",
    alt: "A white lucky cat in a cleanroom suit waving and holding a gold ingot",
  },
  {
    src: "/merch-store/e65de8de-art.webp",
    name: "Tea Between Passages",
    alt: "A white lucky cat in a cleanroom suit waving and holding a glass cup of tea",
  },
];

const BY_SLUG = new Map(STORE_DESIGNS.map((d) => [d.slug, d]));

export function findDesign(slug: string): StoreDesign | undefined {
  return BY_SLUG.get(slug);
}

/** Alt text names the animal and the colour — the two things the photo shows. */
export function teeAlt(design: StoreDesign, colour: TeeColour): string {
  return `${design.productName} tee in ${colour}: a ${design.animal} in a cleanroom suit holding a pink cell-culture flask, above the BioHubNet wordmark`;
}

export function isTeeColour(v: unknown): v is TeeColour {
  return typeof v === "string" && (TEE_COLOURS as readonly string[]).includes(v);
}

export function isTeeSize(v: unknown): v is TeeSize {
  return typeof v === "string" && (TEE_SIZES as readonly string[]).includes(v);
}

// ── Cart ───────────────────────────────────────────────────────────

export interface CartLine {
  slug: string;
  colour: TeeColour;
  size: TeeSize;
  qty: number;
}

export type Cart = CartLine[];

/** Two lines are the same line when design, colour and size all match. */
export function lineKey(line: Pick<CartLine, "slug" | "colour" | "size">): string {
  return `${line.slug}|${line.colour}|${line.size}`;
}

/** Whole tees between MIN_QTY and MAX_QTY; anything unreadable is one. */
export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return MIN_QTY;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.trunc(n)));
}

/**
 * Adds a line, merging into an identical one rather than listing the same
 * tee twice. The merged quantity is clamped, so a line tops out at
 * MAX_QTY however many times Add is pressed. Unknown designs are ignored.
 */
export function addToCart(cart: Cart, line: CartLine): Cart {
  if (!findDesign(line.slug) || !isTeeColour(line.colour) || !isTeeSize(line.size)) return cart;
  const key = lineKey(line);
  const existing = cart.find((l) => lineKey(l) === key);
  if (existing) {
    return cart.map((l) => (l === existing ? { ...l, qty: clampQty(l.qty + clampQty(line.qty)) } : l));
  }
  return [...cart, { slug: line.slug, colour: line.colour, size: line.size, qty: clampQty(line.qty) }];
}

/** Quantity already in the cart for a line — 0 when it is not there. */
export function qtyInCart(cart: Cart, key: string): number {
  return cart.find((l) => lineKey(l) === key)?.qty ?? 0;
}

/** Changing a quantity never removes a line; Remove does that. */
export function setLineQty(cart: Cart, key: string, qty: number): Cart {
  return cart.map((l) => (lineKey(l) === key ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(cart: Cart, key: string): Cart {
  return cart.filter((l) => lineKey(l) !== key);
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, l) => n + l.qty, 0);
}

/** Cents-safe, because 0.1 + 0.2 is not a price. */
export function subtotalCad(cart: Cart, unitCad: number = TEE_PRICE_CAD): number {
  return Math.round(cartCount(cart) * unitCad * 100) / 100;
}

export function formatStoreCad(value: number): string {
  return `$${value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Whatever localStorage hands back, reduced to a valid cart. It is the
 * visitor's own storage, but it outlives catalogue edits: a design that
 * has since been removed, or a hand-edited quantity, must not break the
 * page. Duplicates merge the same way Add merges them.
 */
export function parseCart(raw: unknown): Cart {
  if (!Array.isArray(raw)) return [];
  let cart: Cart = [];
  for (const entry of raw.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const { slug, colour, size, qty } = entry as Record<string, unknown>;
    if (typeof slug !== "string" || !isTeeColour(colour) || !isTeeSize(size)) continue;
    if (typeof qty !== "number") continue;
    cart = addToCart(cart, { slug, colour, size, qty });
  }
  return cart;
}

// ── Receipt ────────────────────────────────────────────────────────

/** FNV-1a, 32-bit. Enough to make a stable joke number; not for anything else. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The order number: the same cart always prints the same number, whatever
 * order the lines were added in, and it is derived from the tees alone —
 * there is nothing personal to derive it from.
 */
export function receiptNumber(cart: Cart): string {
  const canonical = cart
    .map((l) => `${lineKey(l)}x${clampQty(l.qty)}`)
    .sort()
    .join(";");
  const code = fnv1a(canonical).toString(36).toUpperCase().padStart(7, "0");
  return `LFP-37C-${code.slice(0, 3)}-${code.slice(3)}`;
}

export interface ResolvedLine {
  key: string;
  line: CartLine;
  design: StoreDesign;
  lineTotalCad: number;
}

/** Cart lines with their design attached; lines for unknown designs drop out. */
export function resolveLines(cart: Cart, unitCad: number = TEE_PRICE_CAD): ResolvedLine[] {
  return cart.flatMap((line) => {
    const design = findDesign(line.slug);
    if (!design) return [];
    return [{ key: lineKey(line), line, design, lineTotalCad: Math.round(line.qty * unitCad * 100) / 100 }];
  });
}

export interface StoreReceipt {
  number: string;
  lines: ResolvedLine[];
  count: number;
  subtotalCad: number;
  /** Always the whole subtotal: the total due is $0.00. */
  goodwillCad: number;
}

export function buildReceipt(cart: Cart): StoreReceipt {
  const subtotal = subtotalCad(cart);
  return {
    number: receiptNumber(cart),
    lines: resolveLines(cart),
    count: cartCount(cart),
    subtotalCad: subtotal,
    goodwillCad: subtotal,
  };
}
