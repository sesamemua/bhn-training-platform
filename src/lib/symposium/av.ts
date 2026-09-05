/**
 * Symposium AV — last year's quote, last year's actual invoice, and this
 * year's quote, side by side.
 *
 * All three are from Livecast Inc. Transcribed from the PDFs in
 * ~/Desktop/Work Files/2026 TRAINING WEEK AND SYMPOSIUM/AV:
 *
 *   • Estimate #20250956  — 2 Oct 2025, for the 30 Oct 2025 event
 *   • Invoice  #2025-325  — 31 Oct 2025, what was actually billed
 *   • Quote    #231775889 —  1 Sep 2026, for the 29 Oct 2026 event
 *
 * Why the three-way rather than just this year against last year's quote:
 * a quote is what was expected and an invoice is what happened, and the
 * gap between those two in 2025 ($818.68) is the best available estimate
 * of how much the 2026 number will move before it is paid. Comparing
 * 2026 against the 2025 *quote* alone would flatter it.
 *
 * Every figure here is checked against the documents' own stated
 * subtotals and totals by tests/unit/symposium-av.test.ts. If a number is
 * mistyped the totals stop reconciling and the test fails, so the page
 * cannot quietly report a wrong difference.
 */

import clips from "./av-clips.json";

export type AvGroup =
  | "streaming" | "audio" | "video" | "lighting" | "staging" | "labour" | "other";

/** One line as it appears on one document. */
export interface AvEntry {
  /** The wording on that document — they are not consistent year to year. */
  name: string;
  qty: number;
  /** Unit price charged. Where a document shows a struck list price and a
   *  lower charged price, this is the charged one. */
  unit: number;
  total: number;
  detail?: string;
  /**
   * What is actually charged, when the document strikes the list price
   * through and prints a lower one beside it. Absent means charged = total.
   *
   * The 2026 quote does this on five lines. The strikethroughs are drawn
   * as vector rules rather than font styling, so text extraction alone
   * shows both numbers with no indication which one survives — which is
   * how the projectors were first read as a $650 increase when they are
   * in fact flat. Rendering the rows and reading the rules settles it,
   * and the five reductions sum to exactly the $2,320 "Discount" line.
   */
  charged?: number;
}

export interface AvLine {
  key: string;
  /** Canonical name, used for the row label. */
  label: string;
  group: AvGroup;
  q2025?: AvEntry;
  i2025?: AvEntry;
  q2026?: AvEntry;
  /** Only what the documents support. No inference presented as fact. */
  note?: string;
}

export const AV_LINES: AvLine[] = [
  // ── Streaming: entirely new scope for 2026
  {
    key: "hybrid-package",
    label: "Livecast Hybrid Event — Essentials Package",
    group: "streaming",
    q2026: {
      name: "Livecast Hybrid Event - Essentials Package",
      qty: 1, unit: 1000, total: 1000,
      detail:
        "Stream to Livecast Zoom Webinar. vMix laptop package, one hour, single channel, 1,000 viewers or fewer on Livecast's CDN. Full-screen slides only — no video, no overlays, no output to onsite screens. Two laptops plus SDI and HDMI encoders.",
    },
    note: "New scope. There was no stream in 2025 — neither the quote nor the invoice has a streaming line. This is the single largest addition.",
  },
  {
    key: "usb-audio-interface",
    label: "Behringer USB Audio Interface",
    group: "streaming",
    q2026: { name: "Behringer USB Audio Interface", qty: 1, unit: 0, total: 0 },
    note: "Listed on the 2026 quote with no price shown. Reads as included with the hybrid package.",
  },
  {
    key: "encoder-kit",
    label: "Encoder Kit",
    group: "streaming",
    i2025: { name: "Encoder Kit", qty: 1, unit: 50, total: 50 },
    q2026: { name: "Encoder Kit", qty: 1, unit: 100, total: 100 },
    note: "Not on the 2025 quote — added on the day and billed. Unit price has doubled.",
  },
  {
    key: "atem",
    label: "Blackmagic ATEM Mini Extreme (HDMI)",
    group: "streaming",
    i2025: {
      name: "Blackmagic ATEM Mini Extreme (HDMI)", qty: 1, unit: 150, total: 150,
      detail: "8-input HDMI switcher with streaming",
    },
    q2026: {
      name: "Blackmagic ATEM HDMI Mini Extreme", qty: 1, unit: 250, total: 250,
      detail: "2 HDMI outputs, 8 HDMI inputs",
    },
    note: "Same switcher. Not quoted in 2025, billed at $150, now quoted at $250 — a $100 increase on a line that was a surprise last year.",
  },

  // ── Audio
  {
    key: "wireless-mics",
    label: "Shure QLX-D handheld / lavalier kits",
    group: "audio",
    q2025: { name: "Shure QLX D HH/Lavalier Kits", qty: 3, unit: 140, total: 420 },
    i2025: { name: "Shure QLX D HH/Lavalier Kits", qty: 3, unit: 140, total: 420 },
    q2026: { name: "Shure QLX D HH/Lavalier Kits", qty: 3, unit: 150, total: 450 },
    note: "Same three kits. Unit price up $10 (7.1%).",
  },
  {
    key: "podium-mic",
    label: "Podium microphone",
    group: "audio",
    q2025: { name: "Podium Microphones", qty: 1, unit: 75, total: 75, detail: "Two pencil microphones on podium" },
    i2025: { name: "Podium Microphones", qty: 1, unit: 75, total: 75, detail: "Two pencil mics; use podium on-site" },
    q2026: { name: 'Shure MX418 Gooseneck Microphone (18")', qty: 1, unit: 75, total: 75 },
    note: "Same price, different kit: two pencil mics in 2025, one 18\" gooseneck in 2026. Worth confirming one is enough if two people share the podium.",
  },
  {
    key: "pa-system",
    label: "Speaker PA system",
    group: "audio",
    q2025: {
      name: "2 Speaker PA System — CV 1000 Watt with stands", qty: 1, unit: 165, total: 165,
      detail: "Powered speakers, Bluetooth, stands and covers",
    },
    i2025: { name: "4 Speaker PA System — Electro-Voice ZLX-12BT", qty: 1, unit: 330, total: 330 },
    q2026: { name: "4 Speaker PA System — Electro-Voice ZLX-12BT", qty: 1, unit: 265, total: 265 },
    note: "The room needed four speakers, not two: quoted at $165 in 2025 and billed at $330. 2026 quotes the four-speaker rig up front at $265 — cheaper than what was actually paid, and the guesswork is gone.",
  },
  {
    key: "mixer",
    label: "Behringer XR18 digital mixer",
    group: "audio",
    q2025: { name: "Behringer XR18 Mixer", qty: 1, unit: 150, total: 150, detail: "16 channel / 6 output" },
    i2025: { name: "Behringer XR18 Mixer", qty: 1, unit: 150, total: 150 },
    q2026: { name: "Behringer XR18 Digital Mixer", qty: 1, unit: 150, total: 150 },
    note: "Unchanged across all three.",
  },

  // ── Video
  {
    key: "projectors",
    label: "Projectors ×2",
    group: "video",
    q2025: { name: "NEC — 7500 Lumen Projector", qty: 2, unit: 650, total: 1300 },
    i2025: { name: "NEC — 7500 Lumen Projector", qty: 2, unit: 650, total: 1300 },
    q2026: { name: "EPSON Pro-L1495U Projector", qty: 2, unit: 975, total: 1950, charged: 1300 },
    note: "Different projector — an EPSON laser unit in place of the NEC, listed at $1,950 for the pair. That figure is struck through on the quote: the charged total is $1,300, the same $650 per unit as the 2025 NEC. A better projector at last year's price, not an increase.",
  },
  {
    key: "screens",
    label: "7.5' × 13.3' HD Fastfold screens ×2",
    group: "video",
    q2025: { name: "7.5' x 13.3 - HD Fastfold Screen (Wide) w/ DUK", qty: 2, unit: 350, total: 700 },
    i2025: { name: "7.5' x 13.3 - HD Fastfold Screen (Wide) w/ DUK", qty: 2, unit: 350, total: 700 },
    q2026: { name: "7.5' x 13.3 - HD Fastfold Screen (Wide) With DUK", qty: 2, unit: 350, total: 700 },
    note: "Unchanged across all three.",
  },
  {
    key: "cameras",
    label: "Sony FS7 cameras ×2",
    group: "video",
    q2026: { name: "Sony FS7 Camera", qty: 2, unit: 450, total: 900, charged: 450 },
    note: "New — no camera on either 2025 document, and it follows from the stream. Listed at $900 for the pair, struck through and charged at $450.",
  },
  {
    key: "tv-43",
    label: '43" Hisense 4K TV',
    group: "video",
    q2026: {
      name: '43" Hisense TV LED 4k', qty: 1, unit: 250, total: 250,
      detail: "Timer clock and confidence monitor. Timer needed on the large screen before the show starts.",
    },
    note: "New. Solves a real problem — speakers could not see their time in 2025 — but it is a new $250 line.",
  },
  {
    key: "decimator",
    label: "Decimator SDI/HDMI bidirectional converter",
    group: "video",
    q2026: { name: "Decimator SDI/HDMI Bidirectional Converter", qty: 1, unit: 50, total: 50, detail: "For presentation laptops at the front of the room" },
    note: "New.",
  },
  {
    key: "long-cables",
    label: "Long HDMI / SDI cables",
    group: "video",
    q2025: { name: "HDMI / SDI - Long Cables", qty: 1, unit: 0, total: 0, detail: "SDI splitter, encoder kit" },
    i2025: { name: "HDMI / SDI - Long Cables", qty: 1, unit: 0, total: 0 },
    q2026: { name: "HDMI Cable 100' + SDI Cable 100'", qty: 2, unit: 0, total: 0, detail: "For presentation laptops at the front of the room" },
    note: "Free on all three.",
  },

  // ── Lighting
  {
    key: "uplights",
    label: "Astera AX5 uplight LED kit (8)",
    group: "lighting",
    q2025: { name: "Astera AX5 Uplight LED Kit (8)", qty: 1, unit: 400, total: 400 },
    i2025: { name: "Astera AX5 Uplight LED Kit (8)", qty: 1, unit: 400, total: 400 },
    q2026: { name: "Astera AX5 Uplight LED Kit (8)", qty: 1, unit: 400, total: 400, charged: 200, detail: "Plus 8 × Astera AX5 TriplePar uplights, listed with no price" },
    note: "Same kit both years. Listed at $400 again in 2026, struck through and charged at $200 — half what it cost in 2025.",
  },
  {
    key: "aputure",
    label: "Aputure 300D w/ Fresnel adapter kit (two lights)",
    group: "lighting",
    i2025: {
      name: "Aputure 300D w/Fresnel Adapter Kit", qty: 2, unit: 450, total: 900,
      detail: "Two bi-colour lights, medium stands, sandbags, C-stands",
    },
    q2026: { name: "Aputure LS 300x w/Fresnel Adapter Kit (two lights)", qty: 2, unit: 450, total: 900, charged: 0 },
    note: "Not on the 2025 quote — added on the day and billed at $900. Listed at $900 again in 2026, struck through and charged at $0. Free this year, in writing.",
  },

  // ── Staging and power
  {
    key: "drape",
    label: "10' × 12' black drape ×2",
    group: "staging",
    q2025: { name: "10' x 12' Black Drape with Hardware", qty: 2, unit: 90, total: 180 },
    i2025: { name: "10' x 12' Black Drape with Hardware", qty: 2, unit: 90, total: 180 },
    q2026: { name: "Black Drape (10'x12')", qty: 2, unit: 90, total: 180 },
    note: "Unchanged across all three.",
  },
  {
    key: "risers",
    label: 'Riser decks (4\' × 4\' × 12") ×2',
    group: "staging",
    q2026: { name: "Riser Deck (4'x4'x12\")", qty: 2, unit: 60, total: 120, charged: 0 },
    note: "New, and free — listed at $120, struck through and charged at $0.",
  },
  {
    key: "power-bar",
    label: "Power bars ×10",
    group: "staging",
    i2025: { name: "Power Bar", qty: 10, unit: 5, total: 50 },
    q2026: { name: "Power Bar", qty: 10, unit: 0, total: 0 },
    note: "Billed at $50 in 2025 without being quoted. Free in 2026.",
  },
  {
    key: "ac-cables",
    label: "A/C cables",
    group: "staging",
    i2025: { name: "A/C Cables", qty: 10, unit: 5, total: 50 },
    q2026: { name: "A/C Cable", qty: 1, unit: 10, total: 10 },
    note: "Billed at $50 in 2025 without being quoted. One cable at $10 in 2026 — check that one is enough for a room this size.",
  },

  // ── Labour and delivery
  {
    key: "labour-operate",
    label: "A/V labour — show operation",
    group: "labour",
    q2025: { name: "A/V Labour @$85/hour", qty: 20, unit: 85, total: 1700, detail: "2 techs, hours TBD" },
    i2025: { name: "A/V Labour @$85/hour", qty: 24, unit: 85, total: 2040, detail: "2 techs, hours TBD" },
    q2026: {
      name: "A/V Labour @$85/hour (Regular)", qty: 3, unit: 850, total: 2550,
      detail: "3 techs × 10 hours, Thursday 29 Oct from 12:00 PM. OT rates may apply after 10 hours.",
    },
    note: "The line that overran in 2025: quoted at 20 hours, billed at 24. 2026 books 3 techs × 10 hours = 30 hours, and is priced at exactly the 10-hour threshold where overtime starts.",
  },
  {
    key: "labour-setup",
    label: "A/V labour — setup and strike",
    group: "labour",
    q2025: { name: "A/V Labour @$85/hour", qty: 15, unit: 85, total: 1275, detail: "3 techs setup ×3, 3 techs strike ×2" },
    i2025: { name: "A/V Labour @$85/hour", qty: 15, unit: 85, total: 1275, detail: "3 techs setup ×3, 3 techs strike ×2" },
    q2026: { name: "A/V Labour @$85/hour (Regular)", qty: 3, unit: 425, total: 1275, detail: "3 techs × 5 hours, Thursday 29 Oct from 12:00 PM" },
    note: "Identical at $1,275 in all three, and the only labour line that held to its quote in 2025.",
  },
  {
    key: "delivery",
    label: "Delivery fee",
    group: "labour",
    q2025: { name: "Delivery Fee", qty: 1, unit: 350, total: 350 },
    i2025: { name: "Delivery Fee", qty: 1, unit: 350, total: 350 },
    q2026: { name: "Delivery Fee", qty: 1, unit: 350, total: 350 },
    note: "Unchanged across all three.",
  },
];

/** Discounts, which sit below the line items on every document. */
export interface AvDiscount { label: string; amount: number }

export interface AvDoc {
  key: "q2025" | "i2025" | "q2026";
  kind: "quote" | "invoice";
  title: string;
  ref: string;
  dated: string;
  eventDate: string;
  venue: string;
  /** Line items before discount. */
  gross: number;
  discounts: AvDiscount[];
  /** After discounts, before tax. Stated on the document. */
  subtotal: number;
  /**
   * HST at 13%, exactly as stated on the document. On the 2026 quote this
   * is a cent above a single 13% calculation of the subtotal: Livecast
   * taxes each section and then credits tax on the additional discount
   * ($705.90 + $542.75 − $124.85), and the roundings land at $1,123.80
   * rather than $1,123.79. Recorded as stated, not as recomputed.
   */
  tax: number;
  /** Stated total. */
  total: number;
  paymentDue: string;
}

export const AV_DOCS: Record<AvDoc["key"], AvDoc> = {
  q2025: {
    key: "q2025", kind: "quote",
    title: "2025 quote", ref: "Estimate #20250956", dated: "2 Oct 2025",
    eventDate: "30 Oct 2025",
    venue: "Chelsea Hotel Toronto — 33 Gerrard St W, 2nd floor, Mountbatten Room A&B",
    gross: 6715,
    discounts: [{ label: "Discount (10%)", amount: -671.5 }, { label: "50% off", amount: -180 }],
    subtotal: 5863.5, tax: 762.26, total: 6625.76,
    paymentDue: "Due on receipt. Estimate expired 1 Nov 2025.",
  },
  i2025: {
    key: "i2025", kind: "invoice",
    title: "2025 final invoice", ref: "Invoice #2025-325", dated: "31 Oct 2025",
    eventDate: "30 Oct 2025",
    venue: "Chelsea Hotel Toronto — 33 Gerrard St W, 2nd floor, Mountbatten Room A&B",
    gross: 8420,
    discounts: [
      { label: "Discount (10%)", amount: -842 },
      { label: "50% off", amount: -180 },
      { label: "100% item discount", amount: -810 },
    ],
    subtotal: 6588, tax: 856.44, total: 7444.44,
    paymentDue: "Was due 30 Nov 2025.",
  },
  q2026: {
    key: "q2026", kind: "quote",
    title: "2026 quote", ref: "Quote #231775889", dated: "1 Sep 2026",
    eventDate: "29 Oct 2026",
    venue: "Not set — the quote lists the venue as “None”.",
    gross: 11925,
    discounts: [
      { label: "Discount", amount: -2320 },
      { label: "Additional discount", amount: -960.5 },
    ],
    subtotal: 8644.5, tax: 1123.8, total: 9768.3,
    paymentDue: "No deposit required to confirm. Balance due 28 Nov 2026 (net 30).",
  },
};

/** Differences that are not line items — terms, logistics, obligations. */
export interface AvTermChange {
  label: string;
  y2025: string;
  y2026: string;
  /** "cost" = likely to cost BHN money or effort that is not in the quote. */
  impact: "cost" | "risk" | "better" | "neutral";
}

export const AV_TERM_CHANGES: AvTermChange[] = [
  {
    label: "Setup day",
    y2025: "Setup and strike on the event day — 3 techs × 3 hours setup, × 2 strike.",
    y2026: "“Setup the day before.”",
    impact: "cost",
  },
  {
    label: "Venue",
    y2025: "Chelsea Hotel Toronto, Mountbatten Room A&B — named on both documents.",
    y2026: "Listed as “None”. The equipment list assumes a room nobody has named.",
    impact: "risk",
  },
  {
    label: "Overtime",
    y2025: "No overtime clause on either document. Labour simply ran 4 hours over and was billed at $85/hour.",
    y2026: "$170/hour per technician beyond 10 consecutive hours — double the regular rate. Show labour is booked at exactly 10 hours.",
    impact: "risk",
  },
  {
    label: "Cancellation window",
    y2025: "100% within 24 hours, 50% within 48 hours. Exposure began two days out.",
    y2026: "Over $7,500, so: deposit non-refundable at 15+ business days, 25% at 10–14 days, 50% at 6–9 days, 100% within 5 days. Exposure now begins three weeks out.",
    impact: "risk",
  },
  {
    label: "Deposit",
    y2025: "Payments and deposits due on receipt of invoice.",
    y2026: "The terms say events under $15,000 require a 25% deposit; the payment policy on the same document says no initial payment is required. The two do not agree — get it in writing.",
    impact: "risk",
  },
  {
    label: "Payment timing",
    y2025: "Due on receipt; the invoice was dated 31 Oct and due 30 Nov.",
    y2026: "Net 30 after the event. Balance due 28 Nov 2026.",
    impact: "better",
  },
  {
    label: "Rescheduling",
    y2025: "No rescheduling provision.",
    y2026: "May reschedule within one month subject to availability; deposit rolls forward if 15+ business days out.",
    impact: "better",
  },
  {
    label: "Quoting system",
    y2025: "Square estimate and invoice.",
    y2026: "Livecast's own system, with a signature block and itemised list-vs-charged pricing.",
    impact: "neutral",
  },
];

// ── Derived figures ────────────────────────────────────────────────────

export const AV_DELTAS = {
  /** How far 2025 drifted from its own quote. The best available guide to
   *  how far 2026 will drift from this one. */
  overrun2025: {
    amount: AV_DOCS.i2025.total - AV_DOCS.q2025.total,
    pct: (AV_DOCS.i2025.total - AV_DOCS.q2025.total) / AV_DOCS.q2025.total,
  },
  /** 2026 quote against what 2025 actually cost. The fair comparison. */
  quoteVsActual: {
    amount: AV_DOCS.q2026.total - AV_DOCS.i2025.total,
    pct: (AV_DOCS.q2026.total - AV_DOCS.i2025.total) / AV_DOCS.i2025.total,
  },
  /** 2026 quote against last year's quote. Quote to quote. */
  quoteVsQuote: {
    amount: AV_DOCS.q2026.total - AV_DOCS.q2025.total,
    pct: (AV_DOCS.q2026.total - AV_DOCS.q2025.total) / AV_DOCS.q2025.total,
  },
  /** If 2026 drifts by the same proportion 2025 did. */
  projected2026: AV_DOCS.q2026.total * (AV_DOCS.i2025.total / AV_DOCS.q2025.total),

  /**
   * Three different answers to "how much has it gone up", all true.
   *
   *   listRise     what the printed line items say        +41.6%
   *   chargedRise  after the reductions on the quote      +14.1%
   *   payableRise  what BHN is actually asked to pay      +31.2%
   *
   * The gap between the middle and the last is the finding: the equipment
   * is only 14% dearer. 2025 came with $990 of extra goodwill discounts
   * that the 2026 quote does not repeat, and that is most of the rest.
   */
  listRise: (AV_DOCS.q2026.gross - AV_DOCS.i2025.gross) / AV_DOCS.i2025.gross,
  payableRise: (AV_DOCS.q2026.subtotal - AV_DOCS.i2025.subtotal) / AV_DOCS.i2025.subtotal,
  get chargedRise() {
    return (chargedTotal(AV_DOCS.q2026) - chargedTotal(AV_DOCS.i2025)) / chargedTotal(AV_DOCS.i2025);
  },
  /** The one-off reductions 2025 got and 2026 does not. */
  get lostGoodwill() {
    return discountOf(AV_DOCS.i2025) - AV_DOCS.i2025.gross * 0.1;
  },
};

/** Everything on the 2026 quote that is not on either 2025 document. */
export function newIn2026(): AvLine[] {
  return AV_LINES.filter((l) => l.q2026 && !l.q2025 && !l.i2025);
}

/** Everything billed in 2025 that was never quoted — the 2025 surprises. */
export function unquotedIn2025(): AvLine[] {
  return AV_LINES.filter((l) => l.i2025 && !l.q2025);
}

/** Charged total for a line on a document, 0 when absent. */
export function amountOn(line: AvLine, doc: AvDoc["key"]): number {
  return line[doc]?.total ?? 0;
}

/** 2026 minus 2025-actual for one line. */
export function lineDelta(line: AvLine): number {
  return amountOn(line, "q2026") - amountOn(line, "i2025");
}

// ── Discounts ──────────────────────────────────────────────────────────
//
// Two different things get called "discount" on these documents, and
// conflating them is what made the first version of this page wrong.
//
//   1. ITEM REDUCTIONS. On the 2026 quote, five lines have their list
//      price struck through and a lower one printed beside it. Those five
//      reductions sum to exactly the $2,320 "Discount" line, so they are
//      known, not estimated. The 2025 documents have no struck prices.
//
//   2. A BLANKET CUT off the bottom. 10% on every document, plus — on the
//      2025 pair only — a $180 "50% off" and, on the invoice, an $810
//      "100% item discount". Square never says which lines those two hit,
//      so they are spread across the lines in proportion to size.
//
// The consequence: 2026's per-line figures are exact (its blanket cut is
// a uniform 10%, which apportions perfectly), while 2025's carry the
// $990 of unattributable reductions. The page says which is which.

/** What a line actually costs on a document, before the blanket cut. */
export function chargedOn(line: AvLine, key: AvDoc["key"]): number {
  const e = line[key];
  if (!e) return 0;
  return e.charged ?? e.total;
}

/** List minus charged — the item-level reduction on that line. */
export function itemReduction(line: AvLine, key: AvDoc["key"]): number {
  const e = line[key];
  return e ? e.total - (e.charged ?? e.total) : 0;
}

/** Sum of a document's line items after item-level reductions. */
export function chargedTotal(doc: AvDoc): number {
  return Math.round(AV_LINES.reduce((n, l) => n + chargedOn(l, doc.key), 0) * 100) / 100;
}

/** The part of the discount that is not attributable to a named line. */
export function blanketOf(doc: AvDoc): number {
  return Math.round((chargedTotal(doc) - doc.subtotal) * 100) / 100;
}

export function blanketRate(doc: AvDoc): number {
  return blanketOf(doc) / chargedTotal(doc);
}

/** Total discount on a document, as a positive number. */
export function discountOf(doc: AvDoc): number {
  return -doc.discounts.reduce((n, d) => n + d.amount, 0);
}

/** Discount as a share of the document's list total. */
export function discountRate(doc: AvDoc): number {
  return discountOf(doc) / doc.gross;
}

/**
 * One line's share of a document's cost, all in: item reduction applied
 * exactly, blanket cut apportioned by size.
 */
export function netOn(line: AvLine, key: AvDoc["key"]): number {
  const charged = chargedOn(line, key);
  if (charged === 0) return 0;
  return Math.round(charged * (1 - blanketRate(AV_DOCS[key])) * 100) / 100;
}

/** 2026 minus 2025-actual for one line, on the given basis. */
export function netDelta(line: AvLine): number {
  return Math.round((netOn(line, "q2026") - netOn(line, "i2025")) * 100) / 100;
}

export function chargedDelta(line: AvLine): number {
  return Math.round((chargedOn(line, "q2026") - chargedOn(line, "i2025")) * 100) / 100;
}

export const AV_GROUP_LABELS: Record<AvGroup, string> = {
  streaming: "Streaming & capture",
  audio: "Audio",
  video: "Video & projection",
  lighting: "Lighting",
  staging: "Staging & power",
  labour: "Labour & delivery",
  other: "Other",
};

/**
 * Cropped pictures of the row each line occupies on each document —
 * generated from the PDFs, keyed by line and then by document.
 *
 * They exist because reading the extracted TEXT of these quotes is not
 * enough: the 2026 quote strikes through the prices it is not charging,
 * and a strikethrough is a vector rule, invisible to text extraction.
 * Both numbers come out, in an order that does not say which one counts.
 * Seeing the row settles it — which is how the projectors were caught
 * being flat rather than $650 dearer.
 *
 * Served through /api/admin/symposium-av/clip/[file], behind the admin
 * check, because they are pictures of a vendor's pricing.
 */
export interface AvClip {
  /** Cropped image of just this item's row. */
  file: string;
  w: number;
  h: number;
  /** 1-based page of the source PDF. */
  page: number;
  /** Where the row sits on the full page, as [top, bottom] fractions of
   *  page height. Lets the panel draw a highlight and scroll to it
   *  without knowing what resolution the page was rendered at. */
  box: [number, number];
  /** Full-page render, for when the row alone is not enough context. */
  pageFile: string;
}

export interface AvPage { file: string; w: number; h: number }

const clipData = clips as unknown as {
  clips: Record<string, Partial<Record<AvDoc["key"], AvClip>>>;
  pages: Record<string, AvPage>;
};

export const AV_CLIPS = clipData.clips;
export const AV_PAGES = clipData.pages;

export function clipsFor(key: string): Partial<Record<AvDoc["key"], AvClip>> {
  return AV_CLIPS[key] ?? {};
}

export function pageOf(docKey: AvDoc["key"], page: number): AvPage | undefined {
  return AV_PAGES[`${docKey}:${page}`];
}

/**
 * Every page of one document, in order.
 *
 * Derived from the manifest rather than stored as a count on AvDoc: the
 * renders and the number of them are the same fact, and a hand-kept
 * `pages: 4` that disagreed with what is on disk would put a "page 4 of
 * 4" label on a viewer with nothing to show there.
 *
 * All three documents are complete as of 2026-09-04 — q2025 3pp, i2025
 * 2pp, q2026 4pp. Three of those nine renders were missing until then,
 * including the 2026 terms and conditions, which is the page this table
 * argues about most. scripts/av-render-pages.py cuts them.
 */
export function pagesOf(docKey: AvDoc["key"]): { page: number; render: AvPage }[] {
  return Object.entries(AV_PAGES)
    .flatMap(([id, render]) => {
      const [key, n] = id.split(":");
      return key === docKey ? [{ page: Number(n), render }] : [];
    })
    .sort((a, b) => a.page - b.page);
}

/**
 * A token that changes whenever the crops are regenerated.
 *
 * The clip route serves `immutable`, which is a promise that the bytes at
 * a URL never change — and they do, every time the crops are re-cut from
 * the PDFs. Without this, an admin who opened the page yesterday keeps
 * yesterday's images for a day and sees a panel that disagrees with the
 * table beside it. Hashing the manifest gives exactly the right
 * invalidation: re-cropping changes the sizes, which changes the hash,
 * which changes the URL.
 */
export const AV_CLIP_VERSION = (() => {
  const src = JSON.stringify(clipData);
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
})();

const CLIP_BASE = "/api/admin/symposium-av/clip/";

/** URL for one clip or page render, versioned so caches release it. */
export function clipUrl(file: string): string {
  return `${CLIP_BASE}${file}?v=${AV_CLIP_VERSION}`;
}

export const AV_SOURCE_FOLDER =
  "~/Desktop/Work Files/2026 TRAINING WEEK AND SYMPOSIUM/AV";
