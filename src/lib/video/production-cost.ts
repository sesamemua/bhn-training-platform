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
  /** Names listed under the line as removable pills (the lunch list). */
  people?: string[];
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

/** Ontario HST. Exported so the proposal can tax a slice of a group at
 *  the same rate rather than keeping a second copy of the number. */
export const HST = 0.13;
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

// ── Mileage — Ruilin's car, the three rental days ──
// U of T kilometrage rate: $0.57/km (unchanged in the 1 Jan 2026 memo).
// Distances: shortest driving route (OpenStreetMap / OSRM), one loop a day.
// The home address is deliberately not stored — only the kilometres.
export const KM_RATE = 57; // cents per km
const trips = [
  { label: "Day 1 · Mon 5 Oct — home → 2D House → William White → 144 College St → home", note: "Pick up camera and lens", km: 86.4 },
  { label: "Day 2 · Tue 6 Oct — home → 144 College St → home", note: "Shoot day", km: 51.5 },
  { label: "Day 3 · Wed 7 Oct — home → 2D House → William White → 144 College St → home", note: "Return camera and lens", km: 86.4 },
];
const mileage = (km: number) => Math.round(km * KM_RATE);

// ── Insurance — rented camera + lens, 5–7 Oct ──
// Struck out: U of T's Office of Enterprise Risk Management & Insurance
// confirmed no premium is charged for U of T equipment rental agreements.
// The earlier estimate stays visible, crossed out, so the saving shows.
const INSURANCE_ESTIMATE = 46000; // Front Row short-shoot, before 8% RST

// ── Catering — production day, at U of T's 2026 meal allowance ──
// Per diem memo effective 1 Jan 2026 (travel in Canada): lunch $25, used
// here as the per-person ceiling. Lunch only — no breakfast or coffee.
export const LUNCH_GUESTS = [
  "Molly", "Gilbert", "Darius", "Yoo Jin", "Ruilin", "Roshni", "Yeseul", "Epshita", "Alison",
  "Darek (sound & lighting)",
] as const;
export const MEAL_ALLOWANCE = { lunch: 2500 } as const;
// Coffee: 2 Tim Hortons coffee boxes ("Take Twelve", ~12 cups each),
// $19.99–$23.99 depending on store — budgeted at the top of the range.
const COFFEE_BOX = 2399;
const COFFEE_BOXES = 2;

/** The budget, with lunch for whoever is on the list. */
export function buildCostGroups(lunchGuests: readonly string[] = LUNCH_GUESTS): CostGroup[] {
  const n = lunchGuests.length;
  return [
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
      lines: [
        ...sound,
        {
          label: "Parking — after-tax incidental",
          note: "Darek's truck, shoot day, Landmark Garage $22 day maximum. On the quote as “After Tax Incidentals — Parking”, billed at cost with no HST.",
          amount: PARKING_DAY,
        },
      ],
      // HST on the quoted services only; parking is passed through after tax.
      tax: hst(sound.reduce((s, l) => s + l.amount, 0)),
      taxLabel: "HST 13% (not on the parking)",
      notes: [
        "Shoot day Tue 6 Oct. Terms 30 days.",
        "Landmark Garage height clearance is 2.4 m (7 ft 10 in) — Darek's truck is confirmed to fit.",
      ],
    },
    {
      key: "mileage",
      title: "Mileage & parking",
      vendor: "Ruilin — U of T reimbursement",
      source: "$0.57/km · Landmark Garage",
      basis: "estimate",
      lines: [
        ...trips.map((t) => ({ label: t.label, note: `${t.note} · ${t.km} km × $0.57`, amount: mileage(t.km) })),
        { label: "Parking × 3 days", note: "Landmark Garage, 35 Hart House Circle — $22 day maximum, Mon 5 to Wed 7 Oct", amount: PARKING_DAY * 3 },
      ],
      tax: 0,
      taxLabel: "Reimbursed at cost, no tax",
      notes: [
        `Total driving: ${trips.reduce((s, t) => s + t.km, 0).toFixed(1)} km at U of T's kilometrage rate of $0.57/km.`,
        "Distances are the shortest driving route for each day's loop; claim the actual kilometres in Concur.",
        "Parking: the garage under King's College Circle, entered from Wellesley St. West only. $4 per half hour, $22 daily maximum.",
      ],
    },
    {
      key: "insurance",
      title: "Equipment insurance",
      vendor: "U of T Office of Enterprise Risk Management & Insurance",
      source: "No premium charged",
      basis: "quote",
      lines: [{
        label: "Rented equipment, 3 days (5–7 Oct)",
        note: "No insurance premium would be charged for UofT equipment rental agreements.",
        amount: INSURANCE_ESTIMATE,
        removed: true,
      }],
      tax: 0,
      taxLabel: "No premium, no tax",
      notes: [
        "No insurance premium would be charged for UofT equipment rental agreements — per the Office of Enterprise Risk Management & Insurance.",
        "Struck out: the earlier short-term policy estimate ($460 + 8% RST = $496.80) for the camera package and lens from pick-up (Day 1) to return (Day 3).",
        "Both rental houses will still want U of T's certificate of insurance before pick-up.",
      ],
    },
    {
      key: "catering",
      title: "Catering",
      vendor: "U of T meal allowance",
      source: "Per diem memo, effective 1 Jan 2026",
      basis: "estimate",
      lines: [
        { label: `Lunch × ${n}`, note: "At the $25 lunch allowance", amount: MEAL_ALLOWANCE.lunch * n, people: [...lunchGuests] },
        { label: `Tim Hortons coffee box × ${COFFEE_BOXES}`, note: "About 12 cups each, $23.99 per box (top of the $19.99–$23.99 range)", amount: COFFEE_BOX * COFFEE_BOXES },
      ],
      tax: hst(COFFEE_BOX * COFFEE_BOXES),
      taxLabel: "HST 13% on the coffee (the lunch allowance is all-in)",
      notes: [
        "The allowance is a ceiling, not a target — order below it where you can.",
        "U of T does not reimburse its own staff's meals at on-campus meetings; this is hospitality for the shoot, so keep the attendee list with the receipt.",
      ],
    },
  ];
}

export const COST_GROUPS: CostGroup[] = buildCostGroups();

/**
 * Budgets by video project (matched on the project title, which the seeder
 * keeps stable). A project without one shows an empty Production cost tab.
 */
const BUDGETS: Record<string, (lunchGuests?: readonly string[]) => CostGroup[]> = {
  "BHN Promo Video Project": buildCostGroups,
};
export const hasBudget = (projectTitle: string) => projectTitle in BUDGETS;
export const costGroupsFor = (projectTitle: string, lunchGuests?: readonly string[]): CostGroup[] | null =>
  BUDGETS[projectTitle]?.(lunchGuests) ?? null;

/** Where a project's edited lunch list is kept (PlatformSetting, JSON array). */
export const lunchGuestsKey = (projectId: string) => `video.lunchGuests.${projectId}`;
export function parseLunchGuests(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : undefined;
  } catch {
    return undefined;
  }
}

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
