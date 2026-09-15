/**
 * The 8 September 2026 Livecast quotes.
 *
 * ROUND 3 IS THE CURRENT QUOTE. Later on 8 September Livecast recombined
 * the pair below into one document again — v2 of #231816038, "AV and
 * Streaming" (`c2026`). It comes to $9,768.30, exactly the single quote
 * the split had replaced, so the split's $1,220.40 is gone. Its rental and
 * labour sections are line-for-line the v1 "AV Only" quote; what is new is
 * a "Streaming and video" section inside the same document. The decision it
 * leaves is the one AV26_DECISION states: the room alone, or with a stream.
 *
 * What follows is the history, kept because it is why the number moved.
 *
 * Livecast re-issued the Symposium AV as TWO documents rather than one:
 * #231816038 "AV Only v1" for the room, and #231816000 "Streaming" for
 * the broadcast. Both supersede #231775889, which the 2025 comparison
 * page still argues against and which is therefore still in av.ts.
 *
 * WHY THE SPLIT IS THE STORY. Together the two quotes come to $10,988.70
 * against the single quote's $9,768.30 — $1,220.40 more for what reads
 * as the same event. Almost all of it is labour and delivery, because a
 * second document carries a second crew and a second van:
 *
 *   labour + delivery, one quote   $4,175.00
 *   labour + delivery, two quotes  $5,375.00   (+$1,200.00)
 *
 * The kit did not change. Every rental line below appears on the old
 * quote at the same price. Recorded so the conversation with Livecast is
 * about the $1,200, not about the equipment.
 *
 * Figures are read off the documents, never recomputed — where a stated
 * total and a recomputed one disagree, the document wins and the
 * difference is a fact about the document.
 *
 * Pure data. Renders live in the AV 2026 page.
 */

export type Av26Key = "a2026" | "s2026" | "c2026";

/** A section of a quote — Livecast totals rentals and labour separately. */
export interface Av26Section {
  heading: string;
  lines: Av26Line[];
  /** As printed at the foot of the section. */
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
}

export interface Av26Line {
  name: string;
  detail?: string;
  qty: number;
  /** Unit price as printed. */
  unit: number;
  /** Line total as printed. */
  total: number;
  /** Struck-through list price, where the quote reduced one. */
  wasUnit?: number;
  /** Struck-through list total, where the quote reduced one. */
  wasTotal?: number;
}

/**
 * What a line actually costs.
 *
 * Read this before rendering a line. The encoding is the one these
 * documents were first transcribed in and it is easy to misread: `total`
 * is the pre-discount LIST total — so a section's lines add up to its
 * printed subtotal — and where the quote struck a price out (`wasUnit`
 * set), the amount actually charged for the whole line sits in `unit`.
 * Aputure lights: list $900, charged $0. Projectors: list $1,950, charged
 * $1,300. Show `total` alone and a free line reads as $900.
 */
export function chargedLine(line: Av26Line): number {
  return line.wasUnit !== undefined ? line.unit : line.total;
}

export interface Av26Doc {
  key: Av26Key;
  ref: string;
  title: string;
  /** What Livecast called the job on the document. */
  scope: string;
  dated: string;
  expires: string;
  sections: Av26Section[];
  /** The document's own grand totals, as printed on page 2. */
  gross: number;
  discount: number;
  additionalDiscount: number;
  tax: number;
  total: number;
  paymentDue: string;
  pages: number;
}

export const AV26_DOCS: Record<Av26Key, Av26Doc> = {
  c2026: {
    key: "c2026",
    ref: "Quote #231816038 v2",
    title: "AV and streaming — round 3",
    scope: "2026 Annual Symposium BioHubNet — Oct 29, 2026 — AV and Streaming",
    dated: "8 Sep 2026, 6:10 PM",
    expires: "8 Oct 2026",
    gross: 11475,
    discount: -1870,
    additionalDiscount: -960.5,
    tax: 1123.8,
    total: 9768.3,
    paymentDue: "Final due 28 Nov 2026.",
    pages: 4,
    sections: [
      {
        heading: "Rental items",
        subtotal: 5730,
        discount: -1750,
        tax: 517.4,
        total: 4497.4,
        // Line-for-line the v1 AV-only rental section (a2026, below); the
        // test holds the two to that.
        lines: [
          { name: "Shure QLX-D HH / Lavalier kits", detail: "Wireless handheld or lapel microphone", qty: 3, unit: 150, total: 450 },
          { name: "Shure MX418 gooseneck microphone", detail: "18\", podium", qty: 1, unit: 75, total: 75 },
          { name: "Behringer XR18 digital mixer", qty: 1, unit: 150, total: 150 },
          { name: "7.5' × 13.3' HD Fastfold screen (wide) with DUK", qty: 2, unit: 350, total: 700 },
          { name: "Black drape (10' × 12')", qty: 2, unit: 90, total: 180 },
          { name: "Astera AX5 uplight LED kit (8)", detail: "Includes 8 × AX5 TriplePar uplight", qty: 1, unit: 200, total: 400, wasUnit: 400 },
          { name: "4-speaker PA system — Electro-Voice ZLX-12BT", qty: 1, unit: 265, total: 265 },
          { name: "Blackmagic ATEM HDMI Mini Extreme", detail: "2 HDMI out, 8 HDMI in", qty: 1, unit: 250, total: 250 },
          { name: "Encoder kit", qty: 1, unit: 100, total: 100 },
          { name: "Power bar", qty: 10, unit: 0, total: 0 },
          { name: "A/C cable", qty: 1, unit: 10, total: 10 },
          { name: "Aputure LS 300x w/ Fresnel adapter kit (two lights)", qty: 2, unit: 0, total: 900, wasUnit: 450 },
          { name: "EPSON Pro-L1495U projector", qty: 2, unit: 1300, total: 1950, wasUnit: 975 },
          { name: "43\" Hisense LED 4K TV", detail: "Timer clock and confidence monitor", qty: 1, unit: 250, total: 250 },
          { name: "HDMI cable 100'", detail: "Presentation laptops at the front of the room", qty: 1, unit: 0, total: 0 },
          { name: "SDI cable 100'", detail: "Presentation laptops at the front of the room", qty: 1, unit: 0, total: 0 },
          { name: "Decimator SDI/HDMI bidirectional converter", qty: 1, unit: 50, total: 50 },
        ],
      },
      {
        heading: "Streaming and video",
        subtotal: 1995,
        discount: -120,
        tax: 243.75,
        total: 2118.75,
        lines: [
          {
            name: "Livecast Hybrid Event — Essentials Package",
            detail: "vMix laptop package, at least one SDI/HDMI input. One-hour, single-channel stream; 1,000 viewers or fewer on Livecast's private CDN. Full-screen slides only — no video, no overlays, no output to onsite screens. Two laptops (one streams, one monitors) plus SDI and HDMI encoders.",
            qty: 1, unit: 1000, total: 1000,
          },
          { name: "Behringer USB audio interface", detail: "No price shown — reads as included with the package", qty: 1, unit: 0, total: 0 },
          { name: "Sony FS7 camera", qty: 1, unit: 450, total: 450 },
          { name: "Riser deck (4' × 4' × 12\")", qty: 2, unit: 0, total: 120, wasUnit: 60 },
          { name: "A/V labour @ $85/hour (regular)", detail: "1 × 5 hours, Thursday 29 Oct from 12:00 PM. OT may apply after 10 hours.", qty: 1, unit: 425, total: 425 },
        ],
      },
      {
        heading: "Labour & delivery",
        subtotal: 3750,
        tax: 487.5,
        total: 4237.5,
        lines: [
          { name: "A/V labour @ $85/hour (regular)", detail: "3 × 10 hours, Thursday 29 Oct from 12:00 PM. OT may apply after 10 hours.", qty: 3, unit: 850, total: 2550 },
          { name: "A/V labour @ $85/hour (regular) — setup / strike", detail: "2 × 5 hours, Thursday 29 Oct from 12:00 PM", qty: 2, unit: 425, total: 850 },
          { name: "Delivery fee", qty: 1, unit: 350, total: 350 },
          { name: "Notes — client to provide hotel rooms for crew; setup the day before", qty: 1, unit: 0, total: 0 },
        ],
      },
    ],
  },

  a2026: {
    key: "a2026",
    ref: "Quote #231816038",
    title: "AV — the room",
    scope: "2026 Annual Symposium BioHubNet — Oct 29, 2026 — AV Only v1",
    dated: "8 Sep 2026",
    expires: "8 Oct 2026",
    gross: 9480,
    discount: -1750,
    additionalDiscount: -773,
    tax: 904.42,
    total: 7861.42,
    paymentDue: "Final due 28 Nov 2026.",
    pages: 4,
    sections: [
      {
        heading: "Rental items",
        subtotal: 5730,
        discount: -1750,
        tax: 517.4,
        total: 4497.4,
        lines: [
          { name: "Shure QLX-D HH / Lavalier kits", detail: "Wireless handheld or lapel microphone", qty: 3, unit: 150, total: 450 },
          { name: "Shure MX418 gooseneck microphone", detail: "18\", podium", qty: 1, unit: 75, total: 75 },
          { name: "Behringer XR18 digital mixer", qty: 1, unit: 150, total: 150 },
          { name: "7.5' × 13.3' HD Fastfold screen (wide) with DUK", qty: 2, unit: 350, total: 700 },
          { name: "Black drape (10' × 12')", qty: 2, unit: 90, total: 180 },
          { name: "Astera AX5 uplight LED kit (8)", detail: "Includes 8 × AX5 TriplePar uplight", qty: 1, unit: 200, total: 400, wasUnit: 400 },
          { name: "4-speaker PA system — Electro-Voice ZLX-12BT", qty: 1, unit: 265, total: 265 },
          { name: "Blackmagic ATEM HDMI Mini Extreme", detail: "2 HDMI out, 8 HDMI in", qty: 1, unit: 250, total: 250 },
          { name: "Encoder kit", qty: 1, unit: 100, total: 100 },
          { name: "Power bar", qty: 10, unit: 0, total: 0 },
          { name: "A/C cable", qty: 1, unit: 10, total: 10 },
          { name: "Aputure LS 300x w/ Fresnel adapter kit (two lights)", qty: 2, unit: 0, total: 900, wasUnit: 450 },
          { name: "EPSON Pro-L1495U projector", qty: 2, unit: 1300, total: 1950, wasUnit: 975 },
          { name: "43\" Hisense LED 4K TV", detail: "Timer clock and confidence monitor", qty: 1, unit: 250, total: 250 },
          { name: "HDMI cable 100'", detail: "Presentation laptops at the front of the room", qty: 1, unit: 0, total: 0 },
          { name: "SDI cable 100'", detail: "Presentation laptops at the front of the room", qty: 1, unit: 0, total: 0 },
          { name: "Decimator SDI/HDMI bidirectional converter", qty: 1, unit: 50, total: 50 },
        ],
      },
      {
        heading: "Labour & delivery",
        subtotal: 3750,
        tax: 487.5,
        total: 4237.5,
        lines: [
          { name: "A/V labour @ $85/hour (regular)", detail: "3 × 10 hours, Thursday 29 Oct from 12:00 PM. OT may apply after 10 hours.", qty: 3, unit: 850, total: 2550 },
          { name: "A/V labour @ $85/hour (regular) — setup / strike", detail: "2 × 5 hours, Thursday 29 Oct from 12:00 PM", qty: 2, unit: 425, total: 850 },
          { name: "Delivery fee", qty: 1, unit: 350, total: 350 },
          { name: "Notes — client to provide hotel rooms for crew; setup the day before", qty: 1, unit: 0, total: 0 },
        ],
      },
    ],
  },

  s2026: {
    key: "s2026",
    ref: "Quote #231816000",
    title: "Streaming",
    scope: "2026 Annual Symposium BioHubNet — Oct 29, 2026 — Streaming",
    dated: "8 Sep 2026",
    expires: "8 Oct 2026",
    gross: 3645,
    discount: -570,
    additionalDiscount: -307.5,
    tax: 359.78,
    total: 3127.28,
    paymentDue: "Final due 28 Nov 2026.",
    pages: 4,
    sections: [
      {
        heading: "Rental items",
        subtotal: 2020,
        discount: -570,
        tax: 188.5,
        total: 1638.5,
        lines: [
          {
            name: "Livecast Hybrid Event — Essentials Package",
            detail: "Stream to Livecast Zoom Webinar. vMix laptop package, one hour, single channel, 1,000 viewers or fewer on Livecast's CDN. Full-screen slides only — no video, no overlays, no output to onsite screens. Two laptops plus SDI and HDMI encoders.",
            qty: 1, unit: 1000, total: 1000,
          },
          { name: "Behringer USB audio interface", detail: "No price shown — reads as included with the package", qty: 1, unit: 0, total: 0 },
          { name: "Sony FS7 camera", qty: 2, unit: 450, total: 900, wasUnit: 450 },
          { name: "Riser deck (4' × 4' × 12\")", qty: 2, unit: 0, total: 120, wasUnit: 60 },
        ],
      },
      {
        heading: "Labour & delivery",
        subtotal: 1625,
        tax: 211.25,
        total: 1836.25,
        lines: [
          { name: "A/V labour @ $85/hour (regular)", detail: "1 × 10 hours, Thursday 29 Oct from 12:00 PM. OT may apply after 10 hours.", qty: 1, unit: 850, total: 850 },
          { name: "A/V labour @ $85/hour (regular) — setup / strike", detail: "1 × 5 hours, Thursday 29 Oct from 12:00 PM", qty: 1, unit: 425, total: 425 },
          { name: "Delivery fee", qty: 1, unit: 350, total: 350 },
          { name: "Notes — client to provide hotel rooms for crew; setup the day before", qty: 1, unit: 0, total: 0 },
        ],
      },
    ],
  },
};

/** The pair the quote was split into on 8 Sep — superseded by round 3. */
export const AV26_ORDER: Av26Key[] = ["a2026", "s2026"];

/** The quote that stands. */
export const AV26_CURRENT: Av26Key = "c2026";

/** Every 2026 document, current first. Per-document checks run over this. */
export const AV26_ALL: Av26Key[] = ["c2026", "a2026", "s2026"];

/** The two quotes together, which is what BHN actually pays. */
export const AV26_COMBINED = {
  gross: 13125,
  discount: -2320,
  additionalDiscount: -1080.5,
  tax: 1264.2,
  total: 10988.7,
};

/**
 * What the split did to the price.
 *
 * The superseded quote (#231775889, 1 Sep 2026) is in av.ts as `q2026`.
 * Its figures are repeated here rather than imported so this module
 * stays pure data about the September 8 pair — but they must agree, and
 * the AV 2026 page asserts that they do.
 */
export const AV26_VS_SUPERSEDED = {
  supersededRef: "Quote #231775889",
  supersededDated: "1 Sep 2026",
  supersededTotal: 9768.3,
  /** 10,988.70 − 9,768.30 */
  difference: 1220.4,
  /** Labour + delivery, before tax, on the one quote. */
  labourBefore: 4175,
  /** Labour + delivery, before tax, across the two. */
  labourAfter: 5375,
  reasons: [
    {
      label: "A second delivery fee",
      amount: 350,
      detail: "Each document carries its own $350 delivery. One van became two on paper; whether it is two in the loading bay is the question to ask.",
    },
    {
      label: "A fourth show-operation block",
      amount: 850,
      detail: "Three 10-hour operators on the room quote plus one on the streaming quote. The superseded quote had three in total for the same day.",
    },
  ],
};

/**
 * The decision round 3 leaves: the room alone, or the room with a stream.
 *
 * Every figure here is printed on a Livecast document or is the difference
 * of two printed totals. None is an allocation:
 *
 *   room only     $7,861.42  the printed total of #231816038 v1 "AV Only"
 *                            (a2026). Its rental and labour sections are
 *                            round 3's line for line, under the same 10%
 *                            additional discount — so it IS round 3 with
 *                            the streaming section taken out, which the
 *                            terms allow ("You may remove item(s) from your
 *                            order at any time").
 *   with stream   $9,768.30  the printed total of round 3.
 *   streaming     $1,906.88  the difference. Apportioning round 3's 10%
 *                            additional discount to its streaming section
 *                            alone gives $1,906.875 — the same to the cent,
 *                            and the test holds it there.
 */
export const AV26_DECISION = {
  roomOnly: { beforeTax: 6957, total: 7861.42 },
  streaming: { beforeTax: 1687.5, total: 1906.88 },
  withStream: { beforeTax: 8644.5, total: 9768.3 },
  /** The stream as its own quote (s2026), for comparison. */
  streamingAsOwnQuote: 3127.28,
  /**
   * 3,127.28 − 1,906.88. Bundling the stream back into the room quote
   * saves exactly what splitting it out had cost (AV26_VS_SUPERSEDED).
   */
  bundlingSaves: 1220.4,
};
