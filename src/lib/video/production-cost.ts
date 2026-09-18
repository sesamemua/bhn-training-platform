/**
 * BHN Promo Video — production cost for the 6 October 2026 shoot.
 *
 * Every amount is in CENTS so totals never drift by a penny. Vendor lines
 * are copied from the quotes; estimates say what they are built from.
 *
 * Schedule (camera + lens):
 *   Day 1  Mon 5 Oct — pick up (2D House after 12:00)
 *   Day 2  Tue 6 Oct — production
 *   Day 3  Wed 7 Oct — return (2D House before 12:00)
 */

export interface CostLine {
  label: string;
  note?: string;
  /** Pre-tax amount, cents. */
  amount: number;
  /** Struck through: on the vendor's quote, but not being paid for. */
  removed?: boolean;
}

export interface CostGroup {
  key: string;
  title: string;
  vendor: string;
  source: string;
  /** "quote" = from a vendor document; "estimate" = worked out here. */
  basis: "quote" | "estimate";
  lines: CostLine[];
  /** Tax on the kept lines, cents (13% HST, 8% Ontario RST on insurance, or 0). */
  tax: number;
  taxLabel: string;
  notes: string[];
}

const HST = 0.13;
const hst = (cents: number) => Math.round(cents * HST);

// ── Camera — 2D House quote 263434 (15% period discount already applied) ──
// The Atlas Mercury 72 mm on the quote is dropped: the lens comes from
// William White instead. Removing it takes $300.00 gross / $255.00 net off.
const camera: CostLine[] = [
  { label: "ARRI Alexa Mini LF camera package", note: "Body, MVF-2, data kit (2 × 1 TB Codex), bit kit, V-lock battery kit", amount: 140250 },
  { label: "O'Connor 2560 head kit", amount: 15470 },
  { label: "Ronford-Baker standard legs", amount: 4675 },
  { label: "Ronford-Baker spreaders × 2", amount: 1870 },
  { label: "Ronford-Baker baby legs", amount: 4675 },
  { label: "Atlas Mercury 1.5× anamorphic 72 mm lens", note: "Replaced by the William White lens below", amount: 25500, removed: true },
  { label: "ARRI LMB-25 matte box kit", amount: 4675 },
  { label: "Tiffen 4×5.65 ND set (0.3–1.2)", amount: 5270 },
  { label: "Tiffen Black Pro-Mist 1/8", amount: 1318 },
  { label: "SmallHD 702 Touch monitor kit", amount: 11688 },
  { label: "Block Battery SLI-D600 kit", amount: 11688 },
];

// ── Lens — William White (Sunbelt Rentals Film & TV) ──
// $577.15 is exactly $510.75 + 13% HST, so it is read as tax-included.
const LENS_ALL_IN = 57715;
const LENS_PRE_TAX = Math.round(LENS_ALL_IN / (1 + HST)); // 51075

// ── Sound & lighting — CamArt Productions quote 1237 ──
const sound: CostLine[] = [
  { label: "Sound mixer — labour", note: "1 day", amount: 60000 },
  { label: "Sound gear — basic package", note: "SD recorder, wireless lavs, boom, timecode, slate", amount: 30000 },
  { label: "8 ft softbox diffusion, 6×6 frame, negative fill, stands, sandbags", amount: 10000 },
  { label: "Aputure 600x for the softbox", note: "Quoted as “if needed” — drop it to save $113.00", amount: 10000 },
];

// ── Parking — Landmark Garage, under King's College Circle (front campus) ──
// U of T Transportation Services: $22 daily maximum, posted rate taken as all-in.
const PARKING_DAY = 2200;
const PARKING_PEOPLE = 2;

// ── Insurance — rented camera + lens, 5–7 Oct ──
// Insured value, full replacement (estimate): Alexa Mini LF package ≈ $110,000;
// Caldwell Chameleon 75 mm ≈ US$30,900 ≈ $42,000. About $152,000 — inside the
// $250,000 tier of Front Row's short-term production policy, which starts at
// $460 for up to 15 days. Ontario charges 8% retail sales tax on premiums.
const INSURANCE_PREMIUM = 46000;
const INSURANCE_RST = Math.round(INSURANCE_PREMIUM * 0.08);

// ── Catering — production day, at U of T's 2026 meal allowance ──
// Per diem memo effective 1 Jan 2026 (travel in Canada): lunch $25, used
// here as the per-person ceiling. Lunch only — no breakfast or coffee.
export const LUNCH_GUESTS = [
  "Molly", "Gilbert", "Darius", "Yoo Jin", "Ruilin", "Roshni", "Yeseul", "Epshita", "Alison",
  "Lighting / sound technician",
] as const;
export const CATERING_HEADCOUNT = LUNCH_GUESTS.length;
export const MEAL_ALLOWANCE = { lunch: 2500 } as const;
// Coffee: 2 Tim Hortons coffee boxes ("Take Twelve", ~12 cups each),
// $19.99–$23.99 depending on store — budgeted at the top of the range.
const COFFEE_BOX = 2399;
const COFFEE_BOXES = 2;

export const COST_GROUPS: CostGroup[] = [
  {
    key: "camera",
    title: "Camera package",
    vendor: "2D House Inc.",
    source: "Quote 263434 · 10 Sep 2026",
    basis: "quote",
    lines: camera,
    tax: hst(camera.filter((l) => !l.removed).reduce((s, l) => s + l.amount, 0)),
    taxLabel: "HST 13%",
    notes: [
      "Billed as one rental day: pick up Mon 5 Oct after 12:00, return Wed 7 Oct before 12:00.",
      "Prices include 2D House's 15% period discount.",
      "The quote is valid 15 days — confirm it by 25 September.",
      "New account, COD: payment is due on pick-up.",
    ],
  },
  {
    key: "lens",
    title: "Lens",
    vendor: "William White (Sunbelt Rentals Film & TV)",
    source: "Rate given by the vendor",
    basis: "quote",
    lines: [{ label: "Caldwell Chameleon 75 mm anamorphic, full frame", amount: LENS_PRE_TAX }],
    tax: LENS_ALL_IN - LENS_PRE_TAX,
    taxLabel: "HST 13% (inside the $577.15)",
    notes: [
      "Replaces the Atlas Mercury 72 mm from the 2D House quote.",
      "$577.15 is taken as the all-in price: it is exactly $510.75 plus 13% HST. If William White quotes $577.15 before tax, add $75.03.",
    ],
  },
  {
    key: "sound",
    title: "Sound & lighting",
    vendor: "CamArt Productions Inc.",
    source: "Quote 1237 · 17 Sep 2026",
    basis: "quote",
    lines: sound,
    tax: hst(sound.reduce((s, l) => s + l.amount, 0)),
    taxLabel: "HST 13%",
    notes: ["Shoot day Tue 6 Oct. Terms 30 days.", "CamArt bills parking after tax — covered by the parking line below."],
  },
  {
    key: "parking",
    title: "Parking",
    vendor: "U of T Transportation Services",
    source: "Landmark Garage, 35 Hart House Circle",
    basis: "estimate",
    lines: [{ label: `Day parking × ${PARKING_PEOPLE}`, note: "Ruilin's car, and the lighting / sound technician's truck — shoot day, $22 daily maximum each", amount: PARKING_DAY * PARKING_PEOPLE }],
    tax: 0,
    taxLabel: "Posted rate, tax included",
    notes: [
      "The garage under King's College Circle (the front-campus lawn). Enter from Wellesley St. West only.",
      "Rate: $4 per half hour, $22 daily maximum; $10 flat evenings and weekends.",
      "Height clearance is 2.4 m (7 ft 10 in). Check the technician's truck fits — a cube van usually does not, and would need street or surface parking instead.",
    ],
  },
  {
    key: "insurance",
    title: "Equipment insurance",
    vendor: "Short-term production policy (e.g. Front Row Insurance)",
    source: "Estimate",
    basis: "estimate",
    lines: [{ label: "Rented equipment, 3 days (5–7 Oct)", note: "Camera package + lens, ≈ $152,000 replacement value", amount: INSURANCE_PREMIUM }],
    tax: INSURANCE_RST,
    taxLabel: "Ontario RST 8% on premiums",
    notes: [
      "Covers the gear from pick-up (Day 1) through production (Day 2) to return (Day 3). Front Row's short-shoot policy runs up to 15 days, so one policy covers all three.",
      "Replacement value is estimated: Alexa Mini LF package ≈ $110,000; Caldwell Chameleon 75 mm ≈ US$30,900 (≈ $42,000).",
      "Ask U of T Risk Management & Insurance first — the university's blanket property cover may already extend to rented gear, leaving only the deductible. Either way, both rental houses will want a certificate naming them as loss payee.",
      "Without a certificate, 2D House may charge a damage waiver instead — typically 10–15% of the rental.",
    ],
  },
  {
    key: "catering",
    title: "Catering",
    vendor: "U of T meal allowance",
    source: "Per diem memo, effective 1 Jan 2026",
    basis: "estimate",
    lines: [
      { label: `Lunch × ${CATERING_HEADCOUNT}`, note: "At the $25 lunch allowance", amount: MEAL_ALLOWANCE.lunch * CATERING_HEADCOUNT },
      { label: `Tim Hortons coffee box × ${COFFEE_BOXES}`, note: "About 12 cups each, $23.99 per box (top of the $19.99–$23.99 range)", amount: COFFEE_BOX * COFFEE_BOXES },
    ],
    tax: hst(COFFEE_BOX * COFFEE_BOXES),
    taxLabel: "HST 13% on the coffee (the lunch allowance is all-in)",
    notes: [
      `Lunch for ${CATERING_HEADCOUNT}: ${LUNCH_GUESTS.join(", ")}.`,
      "The allowance is a ceiling, not a target — order below it where you can.",
      "U of T does not reimburse its own staff's meals at on-campus meetings; this is hospitality for the shoot, so keep the attendee list with the receipt.",
    ],
  },
];

export const kept = (g: CostGroup) => g.lines.filter((l) => !l.removed);
export const subtotal = (g: CostGroup) => kept(g).reduce((s, l) => s + l.amount, 0);
export const groupTotal = (g: CostGroup) => subtotal(g) + g.tax;

export function totals(groups: CostGroup[] = COST_GROUPS) {
  const pre = groups.reduce((s, g) => s + subtotal(g), 0);
  const tax = groups.reduce((s, g) => s + g.tax, 0);
  const quoted = groups.filter((g) => g.basis === "quote").reduce((s, g) => s + groupTotal(g), 0);
  return { pre, tax, total: pre + tax, quoted, estimated: pre + tax - quoted };
}

export const cad = (cents: number) =>
  (cents < 0 ? "−" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
